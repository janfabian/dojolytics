import { CosmWasmClient, setupWasmExtension } from "@cosmjs/cosmwasm-stargate";
import { QueryClient, setupTxExtension } from "@cosmjs/stargate";
import { HttpBatchClient, Tendermint34Client } from "@cosmjs/tendermint-rpc";
import { splitEvery } from "ramda";
import { RPC } from "./config";

const httpBatch = new HttpBatchClient(RPC);
const t34Client = await Tendermint34Client.create(httpBatch);

export const batchClient = QueryClient.withExtensions(
  t34Client,
  setupWasmExtension,
  setupTxExtension,
);
export const cosmwasmClient = await CosmWasmClient.connect(RPC);

export async function* paginated<T = string>(
  query: (t: T | undefined) => Promise<unknown>,
  resultKey: string,
  startAfterKey?: string,
) {
  let startAfter: T | undefined = undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await query(startAfter);
    const items = result?.[resultKey];

    yield items;

    if (!items) {
      break;
    }

    startAfter = items[items.length - 1];

    if (startAfterKey) {
      startAfter = startAfter?.[startAfterKey];
    }

    hasNextPage = Boolean(startAfter);
  }
}

export async function parallel<P, T>(
  collection: readonly P[],
  l: number,
  fn: (contract: P) => Promise<T>,
): Promise<T[]> {
  let result: T[] = [];
  for (const contractChunks of splitEvery(l, collection)) {
    result = result.concat(await Promise.all(contractChunks.map(fn)));
  }

  return result;
}

export type AssetInfo = CW20AssetInfo | NativeAssetInfo;
export type CW20AssetInfo = { token: { contract_addr: string } };
export type NativeAssetInfo = { native_token: { denom: string } };

export type Asset = {
  info: AssetInfo;
  amount: string;
};

export type PoolInfo = {
  assets: Asset[];
  contract: string;
};

export async function getAstroportPoolInfo(
  pool: string,
): Promise<PoolInfo | null> {
  const pool_info: PoolInfo = await batchClient.wasm.queryContractSmart(pool, {
    pool: {},
  });

  return { ...pool_info, contract: pool };
}

export function getDenom(assetInfo: AssetInfo) {
  if ("native_token" in assetInfo) {
    return assetInfo.native_token.denom;
  } else if ("token" in assetInfo) {
    return assetInfo.token.contract_addr;
  }

  throw new Error("unknown format");
}
