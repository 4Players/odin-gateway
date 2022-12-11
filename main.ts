import config from "./config.ts";
import { AuthorizationRequirements, mappings } from "./mappings.ts";
import { Authorization, parseAuthorization } from "./authorization.ts";
import { Clad, GentleRpc, HttpServer } from "./deps.ts";
import { Config } from "./configSchema.ts";
import { AccessKeyMap, asAccessKeyMap } from "./jwk.ts";
import { ClaimSet } from "./jwt.ts";
import {
  critical,
  debug,
  error,
  info,
  LogArgs,
  setup as logSetup,
  warning,
} from "./log.ts";
import { Meta, WithMeta } from "./meta.ts";
import { filterObject } from "./schema.ts";
import { recordApiCall } from "./stats.ts";
import { state as servers } from "./sfuServers.ts";

parseArguments(
  config,
  new Clad.Command("asa", {
    host: {
      flags: ["h", "host"],
      takesValue: true,
      help: "The IP address to listen on",
    },
    port: {
      flags: ["p", "port"],
      takesValue: true,
      help: "The TCP port number to listen on",
    },
    useSsl: {
      flags: ["s", "ssl"],
      help: "Enable secure connections via HTTPS",
    },
    certFile: {
      flags: ["c", "certificate"],
      takesValue: true,
      requires: ["useSsl", "keyFile"],
      help: "The certificate file to use for HTTPS",
    },
    keyFile: {
      flags: ["k", "privatekey"],
      takesValue: true,
      requires: ["useSsl", "certFile"],
      help: "The private key file to use for HTTPS",
    },
  })
    .version("0.10.0")
    .about(
      "Gateway to regulate access to Selective Forwarding Units for 4Players ODIN",
    )
    .parse(Deno.args),
);

await logSetup(config.logLevel, config.logFormat ?? "pretty");

const headers: Headers = new Headers([
  ["Access-Control-Allow-Origin", "*"],
  ["Access-Control-Allow-Headers", "Authorization,Content-Type"],
  ["Access-Control-Request-Method", "POST"],
  ["Cache-Control", "no-store"],
]);

for (const [url, mapping] of mappings) {
  if (mapping.authorization?.allowUnsigned) {
    error(
      `"${url}" allows unsigned tokens, this should never be set in production!`,
    );
  }
  mapping.methods = Object.fromEntries(
    Object.entries(mapping.methods).map(([name, handler]) => {
      return [name, async (request: unknown & WithMeta) => {
        try {
          debug(name, {
            remoteAddress: addressToString(request.meta.remoteAddress),
            method: request.meta.method,
            url: request.meta.url,
          });
          const result = await handler(request);
          recordApiCall(name, "success");
          return result;
        } catch (err) {
          if (err instanceof GentleRpc.CustomError) {
            recordApiCall(name, "rejected");
          } else {
            recordApiCall(name, "failure");
            error("internal processing error", {
              name,
              error: err instanceof Error ? err.message : null,
              url: request.meta.url,
              remote_address: addressToString(request.meta.remoteAddress),
            });
          }
          throw err;
        }
      }];
    }),
  );
}

let authorizationKeys: AccessKeyMap = new Map();
try {
  const newAuthorizationKeys = asAccessKeyMap(config.customers);
  if (newAuthorizationKeys.size > 0) {
    authorizationKeys = newAuthorizationKeys;
    info(`loaded ${authorizationKeys.size} customer key(s)`);
  } else {
    critical(`failed loading any customer key(s)`);
  }
  if (authorizationKeys.size == 0) {
    warning("activating 'everything goes' fallback");
  }
} catch (err) {
  error("updating authorization keys failed", {
    reason: err instanceof Error ? err.message : String(err),
  });
}

if (config.useSsl) {
  await HttpServer.serveTls(httpHandler, { onListen, ...config.https });
} else {
  await HttpServer.serve(httpHandler, { onListen, ...config.http });
}

function onListen(params: { hostname: string; port: number }) {
  const protocol = config.useSsl ? "https" : "http";
  info(`listening on ${protocol}://${params.hostname}:${params.port}`);
}

async function httpHandler(
  request: Request,
  connInfo: HttpServer.ConnInfo,
): Promise<Response> {
  try {
    return await handle(request, connInfo);
  } catch (e) {
    const reason: LogArgs = e instanceof Error
      ? {
        name: e.name,
        message: e.message,
        trace: e.stack ?? null,
      }
      : {
        name: "unknown",
        message: Deno.inspect(e, { colors: false, compact: true }),
      };
    warning("request handler failed", reason);
    return response(500, {
      code: -32603,
      message: String(reason.message),
    });
  }
}

async function handle(request: Request, connInfo: HttpServer.ConnInfo) {
  const url = new URL(request.url);
  const mapping = mappings.get(url.pathname);
  if (!mapping) {
    return response(404, {
      code: -32700,
      message: "not found",
    });
  }

  if (request.method == "OPTIONS") {
    return response(200);
  }

  const authorization = await getAuthorization(request, mapping?.authorization);
  if (!authorization) {
    return response(401, {
      code: -32700,
      message: "invalid or missing authorization",
    });
  }

  const methods = filterMethods(mapping.methods, authorization.claimSet);
  if (!Object.keys(methods).length) {
    return response(403, {
      code: -32700,
      message: "access denied by token restrictions",
    });
  }

  return await GentleRpc.respond(methods, request, {
    publicErrorStack: false,
    proto: "http",
    additionalArguments: [{
      args: {
        meta: collectMeta(request, connInfo, authorization),
      },
      allMethods: true,
    }],
    enableInternalMethods: false,
    headers,
  });
}

function addressToString(address: Deno.Addr) {
  switch (address.transport) {
    case "tcp":
    case "udp":
      return `${address.hostname}:${address.port}`;
    case "unix":
    case "unixpacket":
      return `unix://${address.path}`;
    default:
      return "<unknown address>";
  }
}

async function getAuthorization(
  request: Request,
  requirements?: AuthorizationRequirements,
): Promise<Authorization | null> {
  const header = request.headers.get("authorization");
  if (header) {
    return await parseAuthorization(header, {
      accessKeys: authorizationKeys,
      serverKeys: servers.publicKeys,
      requiredClaims: requirements?.claims ?? [],
      basicAuthTable: requirements?.basicAuthTable ?? {},
      allowUnknown: config.unknownCustomers !== "forbidden" ||
        authorizationKeys.size === 0,
      allowUnsigned: requirements?.allowUnsigned ?? false,
    });
  } else if (requirements === undefined) {
    return {
      licensee: {
        customerId: "null",
        peerLimit: Infinity,
        roomLimit: Infinity,
      },
      namespace: null,
      claimSet: {},
    };
  } else {
    return null;
  }
}

function filterMethods(
  methods: GentleRpc.Methods,
  claimSet: ClaimSet,
): GentleRpc.Methods {
  const { sub } = claimSet;
  if (sub === undefined) return methods;
  const subs = (Array.isArray(sub) ? sub : [sub]).map((sub) =>
    String(sub).toLowerCase()
  );
  return filterObject(
    methods,
    ([key, _]) => subs.indexOf(key.toLowerCase()) > -1,
  );
}

function parseArguments(config: Config, args: Clad.ArgMatches) {
  if (args.bool.useSsl) {
    config.useSsl = !!args.bool.useSsl;
    config.https.certFile = args.str.certFile ?? config.https.certFile;
    config.https.keyFile = args.str.keyFile ?? config.https.keyFile;
  }

  if (args.str.host) {
    config.https.hostname = args.str.host;
    config.http.hostname = args.str.host;
  }

  if (args.str.port) {
    config.https.port = parseInt(args.str.port);
    config.http.port = parseInt(args.str.port);
  }
}

function response(
  status: number,
  error?: {
    code: number;
    message: string;
  },
): Response {
  return new Response(
    error ? JSON.stringify({ jsonrpc: "2.0", error, id: null }) : undefined,
    {
      status,
      headers,
    },
  );
}

function collectMeta(
  request: Request,
  connInfo: HttpServer.ConnInfo,
  authorization: Authorization,
): Meta {
  const remoteAddress = connInfo.remoteAddr;
  const { method, url, headers } = request;
  const { claimSet, licensee, namespace } = authorization;
  return { remoteAddress, method, url, headers, licensee, namespace, claimSet };
}
