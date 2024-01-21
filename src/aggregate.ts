import fs, { writeFileSync } from "node:fs";
import { parse } from "csv-parse";
import Decimal from "decimal.js";
import { batchClient } from "./lib";
import { getEnvValue } from "./config";

const processFile = async (name) => {
  const records: { addr: string; value: Decimal }[] = [];
  const parser = fs.createReadStream(`${name}`).pipe(
    parse({
      columns: [
        {
          name: "addr",
        },
        {
          name: "value",
        },
      ],
      cast: (value, context) => {
        if (context.column === "value") {
          return new Decimal(value.trim());
        }

        return value;
      },
    }),
  );
  for await (const record of parser) {
    records.push(record);
  }
  return records;
};

const holders = await processFile(getEnvValue("FILENAME_DOJO_HOLDERS"));
const dojo_inj_lp = await processFile(getEnvValue("FILENAME_DOJO_INJ_LP"));
const dojo_pool = await processFile(getEnvValue("FILENAME_DOJO_POOL"));

const datasets = [holders, dojo_inj_lp, dojo_pool];

const result: {
  [key: string]: { balances: Decimal[]; sum: Decimal; note: string };
} = {};

for (const [i, dataset] of datasets.entries()) {
  for (const r of dataset) {
    const { addr, value } = r;

    if (!result[addr]) {
      result[addr] = {
        balances: datasets.map(() => new Decimal(0)),
        sum: new Decimal(0),
        note: "",
      };
    }

    result[addr].balances[i] = value;
    result[addr].sum = result[addr].sum.add(value);
  }
}

for (const [key, d] of Object.entries(result)) {
  if (d.sum.gt(parseInt(getEnvValue("MIN_HOLDING_DOJO_CHECK_IF_CONTRACT")))) {
    console.log(`address ${key} holding DOJO ${d.sum.toFixed(6)}`);
    const note = await (async () => {
      try {
        const info = await batchClient.wasm.getContractInfo(key);

        console.log("is contract: ", info.contractInfo?.label);

        return "contract: " + info.contractInfo?.label || "";
      } catch (e) {
        console.log("is account");
        return "";
      }
    })();

    d.note = note;
  }
}

const sorted_entries = Object.entries(result).sort(
  ([_addr1, a], [_addr2, b]) => {
    if (a.sum.gt(b.sum)) {
      return -1;
    } else if (a.sum.lt(b.sum)) {
      return 1;
    } else {
      return 0;
    }
  },
);

let f = "";

for (const [key, d] of sorted_entries) {
  const addr = key;

  f += `${addr}, ${d.balances.map((d) => d.toFixed(18)).join(",")},${d.sum}, ${
    d.note
  }\n`;
}

writeFileSync(getEnvValue("FILENAME_RESULT"), f);
console.log(getEnvValue("FILENAME_RESULT"), "FINISHED!");
