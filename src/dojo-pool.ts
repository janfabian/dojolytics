import { Address } from "@injectivelabs/sdk-ts";
import Decimal from "decimal.js";
import { backOff } from "exponential-backoff";
import { writeFileSync } from "fs";
import { batchClient } from "./lib";
import { getEnvValue } from "./config";

const dojo_pool_addr = "inj1p0vntlcq7t3uksx56dny7wn334vrtpuwcj884z";

let startAfter: Uint8Array | undefined;

const rewardKeyHex = "0006726577617264";

let f = "";

while (true) {
  const state = await backOff(() =>
    batchClient.wasm.getAllContractState(dojo_pool_addr, startAfter),
  );

  for (const model of state.models) {
    const key = Buffer.from(model.key).toString("hex");

    if (!key.startsWith(rewardKeyHex)) {
      continue;
    }

    try {
      const value = JSON.parse(Buffer.from(model.value).toString("ascii"));
      const holder = Address.fromHex(key.substring(rewardKeyHex.length));

      f += `${holder.bech32Address}, ${new Decimal(value.bond_amount)
        .div(1e18)
        .toFixed(18)}\n`;
    } catch (e) {
      console.log("error", key, Buffer.from(model.value).toString("ascii"));
    }
  }

  startAfter = state.pagination?.nextKey;

  if (!startAfter || startAfter?.length === 0) {
    break;
  }
}

writeFileSync(getEnvValue("FILENAME_DOJO_POOL"), f);
console.log(getEnvValue("FILENAME_DOJO_POOL"), "FINISHED!");
