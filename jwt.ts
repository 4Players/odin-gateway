import { Base64Url, check, Ed25519, failWith, JsonValue } from "./deps.ts";

export type ClaimSet = Record<string, JsonValue>;

export type ParseResult<Key> = {
  key: Key;
  claimSet: ClaimSet;
};

export const alwaysPass = Symbol();
export type AlwaysPass = typeof alwaysPass;

export async function parseJwt<
  Key extends { publicKey: Uint8Array | AlwaysPass },
>(
  jwt: string,
  getKey: (kid: string) => Key,
  flags: { allowUnsigned: boolean },
): Promise<ParseResult<Key>> {
  const [headerText, claimSetText, signatureText, tail] = jwt.split(".", 4);
  check(
    signatureText !== undefined && tail === undefined,
    "token must have three segments",
  );

  const header = decodeObject(headerText);
  const kid = header["kid"];
  check(
    typeof kid === "string" || typeof kid === "number",
    "invalid or missing kid in token",
  );

  const key = getKey(String(kid));
  switch (header.alg) {
    case "EdDSA":
      {
        const crv = header["crv"];
        check(
          crv === "Ed25519" || crv === undefined,
          "unsupported crv in token",
        );

        if (key.publicKey !== alwaysPass) {
          const encoder = new TextEncoder();
          const bytes = encoder.encode(`${headerText}.${claimSetText}`);
          const signature = Base64Url.decode(signatureText);
          const isValid = await Ed25519.verify(signature, bytes, key.publicKey);
          check(isValid, "invalid signature in token");
        }
      }
      break;
    case "none":
      check(flags.allowUnsigned, "token has not been signed");
      break;
    default:
      failWith("unsupported alg in token");
  }

  const claimSet = decodeObject(claimSetText);
  return { key, claimSet };
}

export async function createJwt(
  claimSet: ClaimSet,
  privateKey: Uint8Array,
  kid: string,
): Promise<string> {
  const header = { "alg": "EdDSA", kid };
  const body = `${encodeObject(header)}.${encodeObject(claimSet)}`;
  const signature = await Ed25519.sign(
    new TextEncoder().encode(body),
    privateKey,
  );
  return `${body}.${Base64Url.encode(signature)}`;
}

export function validateSubject(claims: ClaimSet) {
  const { sub } = claims;
  check(isUndefinedOrStringOrStringArray(sub), "invalid sub in token");
}

export function validateAudience(
  claims: ClaimSet,
  audience: string,
) {
  const { aud } = claims;
  check(isUndefinedOrStringOrStringArray(aud), "invalid aud in token");
  check(
    aud === undefined ||
      (Array.isArray(aud) && aud.includes(audience)) ||
      aud === audience,
    "token audience does not match",
  );
}

export function validateExpired(claims: ClaimSet, now = Date.now()) {
  const { exp, nbf } = claims;
  check(isUndefinedOrNumber(exp), "invalid exp in token");
  check(isUndefinedOrNumber(nbf), "invalid nbf in token");
  now = Math.floor(now / 1000); // milliseconds to seconds
  const leeway = 300; // 5min in seconds
  check(exp === undefined || now - exp <= leeway, "token has expired");
  check(nbf === undefined || nbf - now <= leeway, "token not yet valid");
}

function decodeObject(text: string): Record<string, JsonValue> {
  let object;
  try {
    object = JSON.parse(new TextDecoder().decode(Base64Url.decode(text)));
  } catch {
    failWith("invalid json in token");
  }
  check(isObject(object), "json, in token, must be a object");
  return object;
}

function encodeObject(object: Record<string, JsonValue>): string {
  return Base64Url.encode(new TextEncoder().encode(JSON.stringify(object)));
}

function isObject(o: unknown): o is Record<string, JsonValue> {
  return o != null && Array.isArray(o) == false && typeof o === "object";
}

function isUndefinedOrString(o: unknown): o is undefined | string {
  return o === undefined || typeof o === "string";
}

function isUndefinedOrNumber(o: unknown): o is undefined | number {
  return o === undefined || Number.isSafeInteger(o);
}

function isUndefinedOrStringOrStringArray(
  o: unknown,
): o is undefined | string | string[] {
  return isUndefinedOrString(o) ||
    (Array.isArray(o) && o.every((e) => typeof e === "string"));
}
