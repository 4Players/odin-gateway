import { CustomError } from "gentle_rpc";

export type JsonValue = string | number | boolean | null | JsonValue[] | {
  [key: string]: JsonValue;
};

export function check(claim: unknown, message: string): asserts claim {
  if (!claim) {
    failWith(message);
  }
}

export function failWith(
  message: string,
  code?: number,
  data?: JsonValue,
): never {
  throw new CustomError(code ?? -32600, message, data);
}

type ObjectProperty<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T];

export function filterObject<T extends Record<string, unknown>>(
  obj: T,
  func: (
    prop: ObjectProperty<T>,
    i: number,
    arr: ObjectProperty<T>[],
  ) => boolean,
) {
  return Object.fromEntries(
    (Object.entries(obj) as ObjectProperty<T>[]).filter(func),
  ) as T;
}
