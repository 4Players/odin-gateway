import { Licensee } from "./jwk.ts";
import { ClaimSet } from "./jwt.ts";

export interface Meta {
  remoteAddress: Deno.Addr;
  method: string;
  url: string;
  headers: Headers;
  licensee: Licensee;
  namespace: string | null;
  claimSet: ClaimSet | null;
}

export interface WithMeta {
  meta: Meta;
}

export interface WithPool {
  pool: string;
}

export type Parameters = Record<string, unknown> & WithMeta & WithPool;
