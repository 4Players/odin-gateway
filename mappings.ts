import { rpcMethods as internalRpcMethods } from "./internal/api.ts";
import { rpcMethods as externalRpcMethods } from "./external/api.ts";
import { GentleRpc } from "./deps.ts";

export interface Mapping {
  methods: GentleRpc.Methods;
  authorization?: AuthorizationRequirements;
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
