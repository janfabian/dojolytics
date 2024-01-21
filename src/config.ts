export function getEnvValue(name: string, defaultValue?: string) {
  const v = process.env[name];

  if (!v) {
    if (defaultValue != null) {
      return defaultValue;
    } else {
      throw new Error("undefined environment variable " + name);
    }
  } else {
    return v;
  }
}

export const CHAIN_ID = getEnvValue("CHAIN_ID");
export const BASE_DENOM = getEnvValue("BASE_DENOM");
export const RPC = getEnvValue("RPC");
