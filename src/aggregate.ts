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

const result: { [key: string]: { value: Decimal[]; note: string } } = {};

for (const [i, dataset] of datasets.entries()) {
  for (const r of dataset) {
    const { addr, value } = r;

    if (!result[addr]) {
      result[addr] = {
        value: datasets.map(() => new Decimal(0)),
        note: "",
      };
    }

    result[addr].value[i] = value;
  }
}

for (const [key, d] of Object.entries(result)) {
  const sum = d.value.reduce((acc, i) => acc.plus(i), new Decimal(0));

  if (sum.gt(1e6)) {
    console.log(`address ${key} holding DOJO ${sum.toFixed(6)}`);
    const note = await (async () => {
      try {
        const info = await batchClient.wasm.getContractInfo(key);

        console.log(info.contractInfo);

        return "contract: " + info.contractInfo?.label || "";
      } catch (e) {
        console.log("is account");
        return "";
      }
    })();

    d.note = note;
  }
}

let f = "";

for (const [key, d] of Object.entries(result)) {
  const addr = key;

  f += `${addr}, ${d.value.map((d) => d.toFixed(18)).join(",")},, ${d.note}\n`;
}

writeFileSync(getEnvValue("FILENAME_RESULT"), f);
console.log(getEnvValue("FILENAME_RESULT"), "FINISHED!");
