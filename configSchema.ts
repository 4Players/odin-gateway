import { ServeInit, ServeTlsInit } from "std/http/server.ts";
import { JWK } from "./jwk.ts";
import { LevelName, LogFormat } from "./log.ts";

export type Config =
  & CommonConfig
  & NetworkConfig
  & (StaticCustomers | DynamicCustomers);

type DynamicCustomerFunction = () => Promise<Customer[]>;

interface CommonConfig {
  logLevel: LevelName;
  logFormat?: LogFormat;
  sfuPools?: {
    available: string[];
    default: string;
  };
  sfuConfig: {
    metricsServer: string;
    updateInterval: number;
    disableTimeout: number;
    removeTimeout: number;
  };
  loginToken: {
    lifetime: number;
  };
  unknownCustomers: LicenseRequirements | "forbidden";
  masterKey: string;
}

interface NetworkConfig {
  useSsl: boolean;
  http: ServeInit;
  https: ServeTlsInit;
}

interface StaticCustomers {
  customers: Array<Customer>;
}

interface DynamicCustomers {
  customerApi: {
    updateFunction: DynamicCustomerFunction;
    updateInterval: number;
  };
}

export interface AccessKey {
  namespace?: string;
  publicKey: JWK;
}

export interface LicenseRequirements {
  maxPeers: number;
  maxRooms: number;
}

export interface Customer extends LicenseRequirements {
  id: string;
  accessKeys: Array<AccessKey>;
}
