import config from "../config.ts";
import { check, failWith } from "../utils.ts";
import { Methods } from "gentle_rpc";
import { createJwt } from "../jwt.ts";
import { Meta, Parameters } from "../meta.ts";
import { BytesSchema, validate } from "../schema.ts";
import * as sfuServers from "../sfuServers.ts";
import * as z from "zod";
import { TokenClaimsSchema } from "odin-common";

export const rpcMethods: Methods = {
  "Connect": async (parameters: Parameters) => {
    validate(parameters, z.object({}));
    validate(parameters.meta.claimSet, TokenClaimsSchema);

    const { licensee, claimSet: { uid, rid, internal } } = parameters.meta;
    const cid = licensee.customerId;

    if (licensee.peerLimit !== Infinity || licensee.roomLimit !== Infinity) {
      check(
        licensee.peerLimit > sfuServers.getCustomerPeerUsage(cid),
        "peer limit exceeded",
      );
      check(
        licensee.roomLimit > sfuServers.getCustomerRoomUsage(cid),
        "room limit exceeded",
      );
    }

    const roomId = await findFirstRoomId(
      typeof rid === "string" ? [rid] : rid,
      parameters.meta.namespace ?? cid,
    );
    const server = await sfuServers.pickServer(
      roomId,
      cid,
      internal?.server,
    );

    const nbf = Math.floor(Date.now() / 1000) /* now in unix-time */;
    const claims = {
      uid,
      cid,
      rid,
      nsp: roomId[0],
      adr: server.address,
      sub: "connect",
      aud: "sfu",
      exp: nbf + config.loginToken.lifetime,
      nbf,
    };
    const token = await createJwt(
      claims,
      server.key.private,
      server.key.id,
    );

    return { address: server.address, token };
  },

  "RoomClose": async function (parameters: Parameters) {
    validate(
      parameters,
      z.object({
        room_id: z.string(),
        ban_time: z.number().optional(),
      }),
    );

    const roomId = findParamRoomId(parameters.meta, parameters.room_id);
    const server = await sfuServers.getServerByRoom(roomId);

    server.tasks.push({
      task: "RoomClose",
      id: roomId,
      ban_time: {
        secs: parameters.ban_time ?? 0,
        nanos: 0,
      },
    });

    return {};
  },

  "RoomUpdate": async function (parameters: Parameters) {
    validate(
      parameters,
      z.object({
        room_id: z.string(),
        user_data: BytesSchema,
      }),
    );

    const roomId = findParamRoomId(parameters.meta, parameters.room_id);
    const server = await sfuServers.getServerByRoom(roomId);

    server.tasks.push({
      task: "RoomUpdate",
      id: roomId,
      user_data: parameters.user_data,
    });

    return {};
  },

  "RoomBanClient": async function (parameters: Parameters) {
    validate(
      parameters,
      z.object({
        room_id: z.string(),
        user_id: z.string(),
        ban_time: z.number().optional(),
      }),
    );

    const roomId = findParamRoomId(parameters.meta, parameters.room_id);
    const server = await sfuServers.getServerByRoom(roomId);

    server.tasks.push({
      task: "RoomBanClient",
      id: roomId,
      user_id: parameters.user_id,
      ban_time: {
        secs: parameters.ban_time ?? 0,
        nanos: 0,
      },
    });

    return {};
  },

  "RoomSendMessage": async function (parameters: Parameters) {
    validate(
      parameters,
      z.object({
        room_id: z.string(),
        user_id: z.string(),
        message: BytesSchema,
      }),
    );

    const roomId = findParamRoomId(parameters.meta, parameters.room_id);
    const server = await sfuServers.getServerByRoom(roomId);

    server.tasks.push({
      task: "RoomSendMessage",
      id: roomId,
      user_id: parameters.user_id,
      message: parameters.message,
    });

    return {};
  },
};

async function findFirstRoomId(
  rooms: string[],
  namespace: string,
): Promise<sfuServers.RoomId> {
  if (rooms.length == 1) {
    // short circuit, for the simplest case
    return [namespace, rooms[0]];
  } else if (rooms.length == 0) {
    failWith("rid in authorization token must not be empty", 400);
  }
  const roomIds = rooms.map((id) => <sfuServers.RoomId> [namespace, id]);
  const hashes = new Set(
    await Promise.all(roomIds.map(sfuServers.hashRoomId)),
  );
  if (hashes.size != 1) {
    failWith("all values in rid must have the same base", 400);
  }
  return roomIds.pop()!;
}

function findParamRoomId(meta: Meta, roomId: string): sfuServers.RoomId {
  validate(meta.claimSet, TokenClaimsSchema);

  const { licensee, claimSet: { rid } } = meta;
  const cid = licensee.customerId;

  check(
    roomId.startsWith(typeof rid === "string" ? rid : rid[0]),
    "room_id param does not match rid in authorization token",
  );

  return [
    meta.namespace ?? cid,
    roomId,
  ];
}
