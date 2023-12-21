import config from "./config.ts";
import { Base64, Base64Url, check, JsonValue } from "./deps.ts";
import { deriveAuthorizationKey } from "./jwk.ts";
import { info, warning } from "./log.ts";

export type RoomId = [
  string, /* namespace */
  string, /* rid */
];

declare const RoomHashSymbol: unique symbol;
export type RoomHash = string & { readonly [RoomHashSymbol]: never };

export interface Duration {
  secs: number;
  nanos: number;
}

export interface Server {
  /**
   * FQDN and port number where the server can be reached from the Internet
   */
  address: string;
  /**
   * Version of the server
   */
  version: string;
  /**
   * State of the server (disabled servers are considered dead; all rooms should be migrated to other servers)
   */
  disabled: boolean;
  /**
   * Rooms hosted on this server
   */
  rooms: Array<{ hash: RoomHash } & RoomReport>;
  /**
   * Last report sent by the server including rooms, number of clients connected and usage information
   */
  lastReport: Report;
  /**
   * UTC timestamp when the server was first seen
   */
  firstSeen: number;
  /**
   * UTC timestamp when the server was last seen
   */
  lastSeen: number;
  /**
   * Management API tasks for the server to be executed
   */
  tasks: Task[];
  /**
   * Ed25519 keypair for server communication and identification
   */
  key: {
    id: string;
    public: Uint8Array;
    private: Uint8Array;
  };
}

export interface Room {
  id: RoomId;
  customer: string;
  server: Server;
  updated: number;
}

export type Task =
  & JsonValue
  & ({
    task: "RoomClose";
    id: RoomId;
    ban_time: Duration;
  } | {
    task: "RoomUpdate";
    id: RoomId;
    user_data: number[];
  } | {
    task: "RoomBanClient";
    id: RoomId;
    user_id: string;
    ban_time: Duration;
  } | {
    task: "RoomSendMessage";
    id: RoomId;
    user_id: string;
    message: number[];
  });

interface WeightedServer {
  value: number;
  server: Server;
}

interface Usage {
  totalPeers: number;
  totalRooms: number;
}

export interface PublicKey {
  timestamp: number;
  value: Uint8Array;
}

export const state = {
  servers: new Map<string, Server>(),
  weightedServers: new Array<WeightedServer>(),
  rooms: new Map<RoomHash, Room>(),
  publicKeys: new Map<string, Server>(),
  customerUsage: new Map<string, Usage>(),
};

export type Report = JsonValue & {
  rooms: Array<RoomReport>;
  clients: number;
  load: number;
};

export interface RoomReport {
  id: [string, string];
  customer: string;
  age: {
    secs: number;
    nanos: number;
  };
  peers: number;
}

export async function report(
  hostname: string,
  version: string,
  report: Report,
): Promise<Task[]> {
  const server = await getServer(hostname, version);
  await integrateReport(server, report);

  if (server.disabled) {
    info("reenabling sfu server", { reason: "report", hostname });
    server.disabled = false;
  }

  const tasks = server.tasks;
  server.tasks = [];
  return tasks;
}

export async function pickServer(
  id: RoomId,
  customer: string,
  forcedServer?: string,
): Promise<Server> {
  const hash = await hashRoomId(id);
  let room = state.rooms.get(hash);
  if (room === undefined || room.server.disabled) {
    const server = randomServer(forcedServer);
    check(server !== undefined, "no server to assign room too");
    room = {
      id,
      customer,
      server,
      updated: Date.now(),
    };
    state.rooms.set(hash, room);
  }
  return room.server;
}

export async function getServerByRoom(id: RoomId): Promise<Server> {
  const hash = await hashRoomId(id);
  const room = state.rooms.get(hash);
  check(room !== undefined, "no server for room found");
  return room.server;
}

export function getPublicKey(kid: string): Uint8Array | undefined {
  return state.publicKeys.get(kid)?.key.public;
}

function update() {
  pruneServers();
  pruneRooms();
  updateWeights();
  updateCustomerUsage();
}
setInterval(update, config.sfuConfig.updateInterval * 1000);

function tryAddRoom(
  server: Server,
  hash: RoomHash,
  id: RoomId,
  customer: string,
  reason: string,
): boolean {
  const room = state.rooms.get(hash);
  if (room !== undefined && room.server !== server) {
    return false;
  }

  // associate this room, with this server
  info("added room", { reason, hash, id, customer, address: server.address });
  state.rooms.set(hash, {
    id,
    customer,
    server,
    updated: Date.now(),
  });
  return true;
}

function removeRoom(server: Server, hash: RoomHash, reason: string) {
  const room = state.rooms.get(hash);
  if (room?.server == server) {
    const { id, customer } = room;
    info("removed room", {
      reason,
      hash,
      id,
      customer,
      address: server.address,
    });
    state.rooms.delete(hash);
  }
}

function handleRoomCollision(
  server: Server,
  hash: RoomHash,
  id: RoomId,
  customer: string,
  reason: string,
) {
  // failed to associate room with server; already exists on another server
  // tell this server, to close the room, and keep closed at least up until the next report
  warning("room collision", { hash, id, customer, reason });
  server.tasks.push({
    task: "RoomClose",
    id,
    ban_time: {
      secs: config.sfuConfig.updateInterval,
      nanos: 0,
    },
  });
}

function updateWeights() {
  let value = 0;
  state.weightedServers = [];
  for (const server of state.servers.values()) {
    if (server.disabled) continue;
    const load = Math.min(Math.max(server.lastReport.load, 0), 1);
    const weight = 1 - load;
    value += weight;
    state.weightedServers.push({ value, server });
  }
}

function pruneServers() {
  const now = Date.now();
  for (const [hostname, server] of state.servers) {
    const elapsed = (now - server.lastSeen) / 1000;
    if (elapsed >= config.sfuConfig.removeTimeout) {
      removeServer(hostname, "timeout");
    } else if (!server.disabled && elapsed >= config.sfuConfig.disableTimeout) {
      info("disabling sfu server", {
        reason: "timeout",
        hostname,
      });
      server.disabled = true;
    }
  }
}

function pruneRooms() {
  const now = Date.now();
  for (const [hash, room] of state.rooms) {
    const elapsed = (now - room.updated) / 1000;
    if (elapsed > config.loginToken.lifetime) {
      state.rooms.delete(hash);
    }
  }
}

function randomServer(forcedServer?: string): Server | undefined {
  if (forcedServer != undefined) {
    const server = state.servers.get(forcedServer);
    if (server?.disabled === false) {
      return server;
    }
  } else if (state.weightedServers.length !== 0) {
    const max = state.weightedServers[state.weightedServers.length - 1].value;
    const target = Math.random() * max;
    return binarySearch(target, state.weightedServers)?.server;
  }
  return undefined;
}

async function getServer(hostname: string, version: string): Promise<Server> {
  let server = state.servers.get(hostname);
  if (server === undefined) {
    server = await newServer(hostname, version);
  } else {
    server.version = version;
  }
  return server;
}

async function newServer(hostname: string, version: string): Promise<Server> {
  info("added sfu server", { hostname });
  const jwk = await deriveAuthorizationKey(hostname);
  const key = {
    id: jwk.kid,
    public: Base64Url.decode(jwk.x),
    private: Base64Url.decode(jwk.d),
  };

  let server = state.servers.get(hostname);
  if (server === undefined) {
    server = {
      address: `${hostname}`,
      version: version,
      rooms: [],
      disabled: false,
      key,

      lastReport: {
        clients: 0,
        load: 0,
        rooms: [],
      },

      firstSeen: Date.now(),
      lastSeen: Date.now(),

      tasks: [],
    };
    state.servers.set(hostname, server);
    state.publicKeys.set(server.key.id, server);
  }
  return server;
}

function removeServer(hostname: string, reason: string) {
  const server = state.servers.get(hostname);
  if (server !== undefined) {
    info("removed sfu server", {
      reason,
      hostname,
    });
    state.servers.delete(hostname);
    state.publicKeys.delete(server.key.id);
    for (const { hash } of server.rooms) {
      removeRoom(server, hash, "server removed");
    }
  }
}

export function getCustomerPeerUsage(customer: string): number {
  return state.customerUsage.get(customer)?.totalPeers ?? 0;
}

export function getCustomerRoomUsage(customer: string): number {
  return state.customerUsage.get(customer)?.totalRooms ?? 0;
}

function updateCustomerUsage() {
  const customerUsage = new Map<string, Usage>();
  for (const server of state.servers.values()) {
    if (server.disabled) continue;
    for (const room of server.rooms) {
      const usage = customerUsage.get(room.customer) ||
        { totalPeers: 0, totalRooms: 0 };
      usage.totalPeers += room.peers;
      usage.totalRooms += 1;
      customerUsage.set(room.customer, usage);
    }
  }
  state.customerUsage = customerUsage;
}

async function integrateReport(server: Server, report: Report) {
  const rooms = await Promise.all(report.rooms.map(async (room) => {
    return { hash: await hashRoomId(room.id), ...room };
  }));
  rooms.sort((a, b) => a.hash.localeCompare(b.hash));

  for (
    const entry of intersect(rooms, server.rooms, (a) => a.hash, (b) => b.hash)
  ) {
    switch (entry.group) {
      case "A": /* new room */
        {
          const { hash, id, customer } = entry.value;
          if (!tryAddRoom(server, hash, id, customer, "report")) {
            handleRoomCollision(server, hash, id, customer, "report");
          }
        }
        break;
      case "AB": /* kept room */
        {
          const { hash, id, customer } = entry.value;
          state.rooms.set(hash, {
            id,
            customer,
            server,
            updated: Date.now(),
          });
        }
        break;
      case "B": /* removed room */
        {
          const { hash } = entry.value;
          removeRoom(server, hash, "report");
        }
        break;
    }
  }

  server.rooms = rooms;
  server.lastReport = report;
  server.lastSeen = Date.now();
}

export async function hashRoomId([namespace, name]: RoomId): Promise<RoomHash> {
  const encoder = new TextEncoder();
  const namespaceBytes = encoder.encode(namespace);
  const nameBytes = encoder.encode(getBaseName(name));
  const bytes = new Uint8Array(
    1 + namespaceBytes.length + 1 + nameBytes.length,
  );
  bytes[0] = namespaceBytes.length;
  bytes.set(namespaceBytes, 1);
  bytes[namespaceBytes.length + 1] = nameBytes.length;
  bytes.set(nameBytes, namespaceBytes.length + 2);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Base64.encode(hash) as RoomHash;
}

function getBaseName(name: string): string {
  const start = name.indexOf("{");
  if (start == -1) return name;
  const end = name.indexOf("}", start);
  if (end == -1) return name;
  return name.substring(start, end);
}

/**
 * Variant of binary search algorithm, only returns undefined if entries is empty
 * @param target value to be searched for
 * @param entries assumed to be sorted by value in ascending order
 * @returns entry with the largest value below target
 */
function binarySearch<T extends { value: number }>(
  target: number,
  entries: Array<T>,
): T | undefined {
  if (entries.length === 0) return undefined;
  let left = 0, right = entries.length - 1;
  while (left != right) {
    const middle = Math.floor((left + right) / 2);
    if (entries[middle].value <= target) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }
  return entries[left];
}

type IntersectResult<A, B> =
  | { group: "A"; value: A }
  | { group: "AB"; value: A & B }
  | { group: "B"; value: B };

/**
 * Returns the intersection and exclusive parts of two sorted lists
 * @param as must be sorted descending by what is returned by aSelector
 * @param bs must be sorted descending by what is returned by bSelector
 * @param aSelector returns key for a
 * @param bSelector returns key for b
 * @returns intersected and exclusive values
 */
function intersect<A, B>(
  as: Iterable<A>,
  bs: Iterable<B>,
  aSelector: (a: A) => string,
  bSelector: (b: B) => string,
): IterableIterator<IntersectResult<A, B>> {
  const as_iter = as[Symbol.iterator]();
  const bs_iter = bs[Symbol.iterator]();
  let a = as_iter.next();
  let b = bs_iter.next();
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      if (a.done && b.done) {
        return { done: true, value: null };
      }
      let value: IntersectResult<A, B>;
      const cmp = a.done
        ? 1
        : b.done
        ? -1
        : aSelector(a.value).localeCompare(bSelector(b.value));
      if (cmp == 0) {
        value = { group: "AB", value: { ...a.value, ...b.value } };
        a = as_iter.next();
        b = bs_iter.next();
      } else if (cmp < 0) {
        value = { group: "A", value: a.value };
        a = as_iter.next();
      } else {
        value = { group: "B", value: b.value };
        b = bs_iter.next();
      }
      return { done: false, value };
    },
  };
}
