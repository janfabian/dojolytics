import Decimal from "decimal.js";
import { getEnvValue } from "./config";
import { paginated, parallel, batchClient } from "./lib";
import { writeFileSync } from "fs";
import { backOff } from "exponential-backoff";

const dojoAddr = "inj1zdj9kqnknztl2xclm5ssv25yre09f8908d4923";

let holders: string[] = [];

console.log("loading all accounts");

for await (const items of paginated<string[]>((startAfter) => {
  return backOff(() =>
    batchClient.wasm.queryContractSmart(dojoAddr, {
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
    const { balance } = await batchClient.wasm.queryContractSmart(dojoAddr, {
      balance: {
        address: holder,
      },
    });

    console.log(`${holder}, ${new Decimal(balance).div(1e18).toFixed(18)}`);

    f += `${holder}, ${new Decimal(balance).div(1e18).toFixed(18)}\n`;
  }),
);

writeFileSync(getEnvValue("FILENAME_DOJO_HOLDERS"), f);
console.log(getEnvValue("FILENAME_DOJO_HOLDERS"), "FINISHED!");
