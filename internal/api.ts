import { assert, GentleRpc, toml } from "../deps.ts";
import { extendGridConfig } from "../gridConfigGenerator.ts";
import { Meta, Parameters } from "../meta.ts";
import { validate } from "../schema.ts";
import * as sfuServers from "../sfuServers.ts";
import { deriveAuthorizationKey } from "../jwk.ts";

export const rpcMethods: GentleRpc.Methods = {
  "sfu.GridConfig": async function (parameters: Parameters) {
    validate(parameters, "parameters", {
      type: "Object",
      fields: {
        public_endpoint: { type: "String", optional: true },
        version: { type: "String" },
        config: { type: "String" },
      },
    });

    const config = toml.parse(parameters.config);
    const hostname = getHostname(parameters.public_endpoint, parameters.meta);
    const jwk = await deriveAuthorizationKey(hostname);

    extendGridConfig(config, jwk);

    return { config: toml.stringify(config) };
  },

  "sfu.Report": async function (parameters: Parameters) {
    validate(parameters, "parameters", {
      type: "Object",
      fields: {
        public_endpoint: { type: "String", optional: true },
        load: { type: "Number" },
        rooms: {
          type: "Object",
          array: true,
          fields: {
            id: { type: "RoomId" },
            customer: { type: "String" },
            age: {
              type: "Object",
              fields: {
                secs: { type: "Number" },
                nanos: { type: "Number" },
              },
            },
            peers: { type: "Number" },
          },
        },
        clients: { type: "Number" },
      },
    });

    const hostname = getHostname(parameters.public_endpoint, parameters.meta);
    const tasks = await sfuServers.report(hostname, {
      load: parameters.load,
      clients: parameters.clients,
      rooms: parameters.rooms,
    });

    return { tasks };
  },
};

function getHostname(publicEndpoint: unknown, meta: Meta): string {
  if (publicEndpoint != null) {
    return String(publicEndpoint);
  } else {
    assert(meta.remoteAddress.transport === "tcp");
    return `${meta.remoteAddress.hostname}:4433`;
  }
}
