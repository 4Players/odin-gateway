import config from "./config.ts";
import { Customer } from "./configSchema.ts";
import * as Base64 from "std/encoding/base64.ts";
import * as Base64Url from "std/encoding/base64url.ts";
import { assert } from "std/testing/asserts.ts";
import { getPublicKey } from "ed25519";
import { warning } from "./log.ts";

export type JWK = OKP;
export type PrivateJWK = PrivateOKP;

export interface OKP {
  kty: "OKP";
  crv: "Ed25519";
  kid: string;
  x: string;
}
export interface PrivateOKP extends OKP {
  d: string;
}

export interface Licensee {
  customerId: string;
  peerLimit: number;
  roomLimit: number;
}

export interface AccessKey {
  namespace: string;
  licensee: Licensee;
  publicKey: Uint8Array;
}

export type AccessKeyMap = Map<string, AccessKey>;

export function asAccessKeyMap(customers: Customer[]): AccessKeyMap {
  const result: AccessKeyMap = new Map();
  for (const customer of customers) {
    for (const accessKey of customer.accessKeys) {
      try {
        const publicKey = Base64Url.decode(accessKey.publicKey.x);
        assert(publicKey.byteLength == 32, "invalid public key");
        result.set(accessKey.publicKey.kid, {
          namespace: accessKey.namespace ?? customer.id,
          licensee: {
            customerId: customer.id,
            peerLimit: customer.maxPeers,
            roomLimit: customer.maxRooms,
          },
          publicKey,
        });
      } catch (err) {
        warning(
          `skipping '${accessKey.publicKey.x}' from '${customer.id}', broken public key`,
          {
            error: err instanceof Error ? err.message : null,
          },
        );
      }
    }
  }
  return result;
}

const HKDF512 = { name: "HKDF", hash: "SHA-512" };
const masterKey = await crypto.subtle.importKey(
  "raw",
  Base64.decode(config.masterKey),
  HKDF512,
  false,
  [
    "deriveBits",
  ],
);

export async function deriveAuthorizationKey(
  identifier: string,
): Promise<PrivateJWK> {
  const encoder = new TextEncoder();
  const privateKey = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      await crypto.subtle.deriveBits(
        {
          ...HKDF512,
          info: encoder.encode("grid-connection-key"),
          salt: encoder.encode(identifier),
        },
        masterKey,
        4096,
      ),
    ),
  );
  const publicKey = await getPublicKey(privateKey);
  return {
    kid: await getKeyId(publicKey),
    kty: "OKP",
    crv: "Ed25519",
    x: Base64Url.encode(publicKey),
    d: Base64Url.encode(privateKey),
  };
}

async function getKeyId(publicKey: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-512", publicKey));
  const result = new Uint8Array(9);
  result[0] = 0x02; /* user generated keys use 0x01 */
  for (let i = 0, x = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++, x++) {
      result[1 + j] ^= hash[x];
    }
  }
  return Base64.encode(result);
}
