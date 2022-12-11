import config from "./config.ts";
import { check, failWith } from "./deps.ts";
import { AccessKeyMap, Licensee } from "./jwk.ts";
import {
  AlwaysPass,
  alwaysPass,
  ClaimSet,
  parseJwt,
  validateAudience,
  validateExpired,
  validateSubject,
} from "./jwt.ts";
import { Server } from "./sfuServers.ts";

export interface Authorization {
  claimSet: ClaimSet;
  licensee: Licensee;
  namespace: string | null;
}

export interface Configuration {
  accessKeys: AccessKeyMap;
  serverKeys: Map<string, Server>;
  requiredClaims: Array<string[] | string>;
  basicAuthTable: Record<string, string>;
  allowUnknown: boolean;
  allowUnsigned: boolean;
}

export async function parseAuthorization(
  authorization: string,
  configuration: Configuration,
): Promise<Authorization> {
  const [type, credentials] = authorization.split(" ", 2);
  check(type && credentials, "missing authorization");

  switch (type) {
    case "Basic":
      return parseBasicAuthorization(credentials, configuration);
    case "Bearer":
      return await parseBearerAuthorization(credentials, configuration);
    default:
      failWith("invalid authorization");
  }
}

function parseBasicAuthorization(
  credentials: string,
  configuration: Configuration,
): Authorization {
  const [user, pw] = atob(credentials).split(":");

  check(
    Object.prototype.hasOwnProperty.call(configuration.basicAuthTable, user),
    "invalid credentials",
  );
  const expectedPw = configuration.basicAuthTable[user];
  check(secureCompare(pw, expectedPw), "invalid credentials");

  return {
    licensee: { customerId: user, peerLimit: Infinity, roomLimit: Infinity },
    namespace: null,
    claimSet: {},
  };
}

async function parseBearerAuthorization(
  credentials: string,
  configuration: Configuration,
): Promise<Authorization> {
  const { licensee, namespace, claimSet } = await parseToken(
    credentials,
    configuration,
  );

  validateSubject(claimSet);
  validateAudience(claimSet, "gateway");
  validateExpired(claimSet);

  const allClaimsPresent = configuration.requiredClaims.every((claims) => {
    return !!Array(claims).flat().find((claim) =>
      Object.prototype.hasOwnProperty.call(claimSet, claim)
    );
  });
  check(allClaimsPresent, "missing required claims in token");

  return { licensee, namespace, claimSet };
}

async function parseToken(token: string, configuration: Configuration) {
  const parsed = await parseJwt(token, selectKey(configuration), {
    allowUnsigned: configuration.allowUnsigned,
  });
  let licensee: Licensee;
  let namespace: string | null;
  switch (parsed.key.kind) {
    case "server":
      check(typeof parsed.claimSet.cid === "string", "cid must be a string");
      check(typeof parsed.claimSet.nsp === "string", "nsp must be a string");
      licensee = {
        customerId: parsed.claimSet.cid,
        peerLimit: Infinity,
        roomLimit: Infinity,
      };
      namespace = parsed.claimSet.nsp;
      break;
    case "api":
    case "demo":
      licensee = parsed.key.licensee;
      namespace = parsed.key.namespace;
      break;
    default:
    case "unknown":
      failWith("not authorized");
  }
  return { licensee, namespace, claimSet: parsed.claimSet };
}

type TokenKey =
  & { publicKey: Uint8Array | AlwaysPass }
  & ({
    kind: "api" | "demo";
    licensee: Licensee;
    namespace: string | null;
  } | {
    kind: "server" | "unknown";
  });

function selectKey(configuration: Configuration) {
  return (kid: string): TokenKey => {
    const accessKey = configuration.accessKeys.get(kid);
    if (accessKey !== undefined) {
      return {
        kind: "api",
        licensee: accessKey.licensee,
        namespace: accessKey.namespace,
        publicKey: accessKey.publicKey,
      };
    }
    const serverKey = configuration.serverKeys.get(kid);
    if (serverKey !== undefined) {
      return {
        kind: "server",
        publicKey: serverKey.key.public,
      };
    }
    if (configuration.allowUnknown) {
      const { maxPeers, maxRooms } = config.unknownCustomers !== "forbidden"
        ? config.unknownCustomers
        : { maxPeers: Infinity, maxRooms: Infinity };
      return {
        kind: "demo",
        licensee: {
          customerId: `demo_${kid}`,
          peerLimit: maxPeers,
          roomLimit: maxRooms,
        },
        namespace: null,
        publicKey: alwaysPass,
      };
    }
    return { kind: "unknown", publicKey: alwaysPass };
  };
}

function secureCompare(a: string, b: string): boolean {
  let mismatch = a.length === b.length ? 0 : 1;
  if (mismatch) b = a;

  for (let i = 0, len = a.length; i < len; ++i) {
    const ac = a.charCodeAt(i);
    const bc = b.charCodeAt(i);
    mismatch |= ac ^ bc;
  }

  return mismatch === 0;
}
