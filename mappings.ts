import { rpcMethods as internalRpcMethods } from "./internal/api.ts";
import { rpcMethods as externalRpcMethods } from "./external/api.ts";
import { Methods } from "gentle_rpc";

export interface Mapping {
  methods: Methods;
  authorization?: AuthorizationRequirements;
  pool?: string;
}

export interface AuthorizationRequirements {
  claims?: (string | string[])[];
  validSubjects?: string[];
  allowUnsigned?: boolean;
  basicAuthTable?: Record<string, string>;
}

const internal: [string, Mapping] = ["/internal", {
  methods: internalRpcMethods,
  /*
  authorization: {
    basicAuthTable: {
      "username": "password",
    },
  },
  */
}];

const external: [string, Mapping] = ["/", {
  methods: externalRpcMethods,
  authorization: {
    claims: ["rid", "uid"],
    allowUnsigned: false,
  },
}];

export const mappings = new Map([internal, external]);
