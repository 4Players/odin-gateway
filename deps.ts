export * as Colors from "https://deno.land/std@0.176.0/fmt/colors.ts";
export * as Base64 from "https://deno.land/std@0.176.0/encoding/base64.ts";
export * as Base64Url from "https://deno.land/std@0.176.0/encoding/base64url.ts";
export * as HttpServer from "https://deno.land/std@0.176.0/http/server.ts";
export * as toml from "https://deno.land/std@0.176.0/encoding/toml.ts";
export { assert } from "https://deno.land/std@0.176.0/testing/asserts.ts";

export * as Clad from "https://deno.land/x/clad@v0.6.4/mod.ts";
export * as Ed25519 from "https://deno.land/x/ed25519@1.7.1/mod.ts";
export * as GentleRpc from "https://deno.land/x/gentle_rpc@v3.4/mod.ts";

import { CustomError } from "https://deno.land/x/gentle_rpc@v3.4/mod.ts";

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
