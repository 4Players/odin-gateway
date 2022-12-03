export interface ApiCallStats {
  success: number;
  failure: number;
  rejected: number;
}

export const apiCallStats = new Map<string, ApiCallStats>();

export function recordApiCall<Value extends keyof ApiCallStats>(
  name: string,
  value: Value,
) {
  let entry = apiCallStats.get(name);
  if (entry === undefined) {
    entry = { success: 0, failure: 0, rejected: 0 };
    apiCallStats.set(name, entry);
  }
  entry[value] += 1;
}
