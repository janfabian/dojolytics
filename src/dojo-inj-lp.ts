import Decimal from "decimal.js";
import { writeFileSync } from "fs";
import { backOff } from "exponential-backoff";
import {
  batchClient,
  getAstroportPoolInfo,
  getDenom,
  paginated,
  parallel,
} from "./lib";
import { getEnvValue } from "./config";

const DOJO_TOKEN_ADDR = "inj1zdj9kqnknztl2xclm5ssv25yre09f8908d4923";
const DOJO_INJ_LP_ADDR = "inj17pda96ujt7fzr3d5jmfkh4dzvrqzc0nk56kt34";
const DOJO_INJ_LP_FARM_ADDR = "inj19rutrad95wzcw93gfnuranetmc570cvtj8j8cg";

const DOJO_INJ_POOL = await getAstroportPoolInfo(
  "inj1grtkdl7552kjsrkqn5wqpk4fp8m3m4y0tzqfqr",
);

if (!DOJO_INJ_POOL) {
  throw new Error("dojo-inj pool not found");
}

let dojoAmount = new Decimal(
  DOJO_INJ_POOL.assets.find(
    (a) => getDenom(a.info) === DOJO_TOKEN_ADDR,
  )!.amount,
);

const dojoInjLPTokenInfo = await batchClient.wasm.queryContractSmart(
  DOJO_INJ_LP_ADDR,
  {
    token_info: {},
  },
);

const dojoInjLPTotalSupply = new Decimal(dojoInjLPTokenInfo.total_supply);

const dojoInjLPState = await batchClient.wasm.queryContractSmart(
  DOJO_INJ_LP_FARM_ADDR,
  {
    state: {},
  },
);

const dojoInjFarmTotalBond = new Decimal(dojoInjLPState.total_bond_amount);

let { balance } = await batchClient.wasm.queryContractSmart(DOJO_INJ_LP_ADDR, {
  balance: {
    address: DOJO_INJ_LP_FARM_ADDR,
  },
});

const totalDojoInFarm = new Decimal(balance)
  .div(dojoInjLPTotalSupply)
  .mul(dojoAmount);

let holders: string[] = [];

console.log("loading all accounts");

for await (const items of paginated<string[]>((startAfter) => {
  return backOff(() =>
    batchClient.wasm.queryContractSmart(DOJO_INJ_LP_ADDR, {
      all_accounts: {
        limit: 30,
        start_after: startAfter,
      },
    }),
  );
}, "accounts")) {
  holders = holders.concat(items);
  console.log(holders.length);
}

let f = "";

console.log("loading balances");

await parallel(holders, 20, (holder) =>
  backOff(async () => {
    let { balance } = await batchClient.wasm.queryContractSmart(
      DOJO_INJ_LP_ADDR,
      {
        balance: {
          address: holder,
        },
      },
    );

    let { bond_amount } = await batchClient.wasm.queryContractSmart(
      DOJO_INJ_LP_FARM_ADDR,
      {
        staker_info: {
          staker: holder,
        },
      },
    );

    balance = new Decimal(balance)
      .div(dojoInjLPTotalSupply)
      .mul(dojoAmount)
      .plus(
        new Decimal(bond_amount).div(dojoInjFarmTotalBond).mul(totalDojoInFarm),
      );

    console.log(`${holder}, ${balance.div(1e18).toFixed(18)}`);

    f += `${holder}, ${balance.div(1e18).toFixed(18)}\n`;
  }),
);

writeFileSync(getEnvValue("FILENAME_DOJO_INJ_LP"), f);
console.log(getEnvValue("FILENAME_DOJO_INJ_LP"), "FINISHED!");
