import { check, failWith, JsonValue } from "../utils.ts";
import { assert } from "std/testing/asserts.ts";
import * as Toml from "std/toml/mod.ts";
import { Methods } from "gentle_rpc";
import { extendGridConfig } from "../gridConfigGenerator.ts";
import { Meta, Parameters } from "../meta.ts";
import { RoomIdSchema, TimeStampSchema, validate } from "../schema.ts";
import * as sfuServers from "../sfuServers.ts";
import { apiCallStats } from "../stats.ts";
import { deriveAuthorizationKey } from "../jwk.ts";
import * as z from "zod";

export const rpcMethods: Methods = {
  "Info": function () {
    const servers: JsonValue = Array.from(sfuServers.state.servers)
      .map(([hostname, server]) => {
        return {
          hostname,

          address: server.address,
          version: server.version,
          disabled: server.disabled,

          keyId: server.key.id,

          report: server.lastReport,

          firstSeen: new Date(server.firstSeen).toISOString(),
          lastSeen: new Date(server.lastSeen).toISOString(),

          tasks: server.tasks.length,
        };
      });

    const rooms: JsonValue = Array.from(sfuServers.state.rooms).map(
      ([hash, room]) => {
        return {
          hash,
          id: room.id,
          customer: room.customer,
          server: room.server.address,
          updated: new Date(room.updated).toISOString(),
        };
      },
    );

    const stats = {
      apiCalls: Array.from(apiCallStats).map(([name, stats]) => {
        return { name, ...stats };
      }),
    };

    return { servers, rooms, stats };
  },

  "sfu.GridConfig": async function (parameters: Parameters) {
    mustBeGridServer(parameters);
    return await getConfig(parameters);
  },

  "sfu.Report": async function (parameters: Parameters) {
    mustBeGridServer(parameters);
    return await submitReport(parameters);
  },

  "GetConfig": async function (parameters: Parameters) {
    return await getConfig(parameters);
  },

  "SubmitReport": async function (parameters: Parameters) {
    return await submitReport(parameters);
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

function mustBeGridServer(parameters: Parameters) {
  if (parameters["server"] == undefined) {
    parameters["server"] = "grid";
  } else if (parameters["server"] !== "grid") {
    failWith("api must be used for grid servers only");
  }
}

async function getConfig(parameters: Parameters) {
  validate(
    parameters,
    z.object({
      public_endpoint: z.string().optional(),
      server: z.enum(["grid", "saga"]),
      version: z.string(),
      config: z.string(),
    }),
  );

  check(parameters.server == "grid", "only grid is supported");

  const config = Toml.parse(parameters.config);
  const hostname = getHostname(parameters.public_endpoint, parameters.meta);
  const jwk = await deriveAuthorizationKey(hostname);

  extendGridConfig(config, jwk);

  return { config: Toml.stringify(config) };
}

async function submitReport(parameters: Parameters) {
  validate(
    parameters,
    z.object({
      public_endpoint: z.string().optional(),
      server: z.enum(["grid", "saga"]),
      version: z.string(),
      load: z.number(),
      rooms: z.array(z.object({
        id: RoomIdSchema,
        customer: z.string(),
        age: TimeStampSchema,
        peers: z.number(),
      })),
      clients: z.number(),
    }),
  );

  check(parameters.server == "grid", "only grid is supported");

  const hostname = getHostname(parameters.public_endpoint, parameters.meta);
  const tasks = await sfuServers.report(hostname, parameters.version, {
    load: parameters.load,
    clients: parameters.clients,
    rooms: parameters.rooms,
  });

  return { tasks };
}
