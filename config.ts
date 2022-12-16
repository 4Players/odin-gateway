import { Config } from "./configSchema.ts";

const config: Config = {
  /** Logging severity*/
  logLevel: "INFO",
  /** Logging format (pretty/json) */
  logFormat: "pretty",

  /** Wether or not to enable HTTPS */
  useSsl: false,

  /** Config for Deno HttpServer (ServeInit) */
  http: {
    hostname: "0.0.0.0",
    port: 7000,
  },

  /** Config for Deno HttpServer (ServeTlsInit) */
  https: {
    hostname: "0.0.0.0",
    port: 7000,
    certFile: "fullchain.pem",
    keyFile: "privkey.pem",
  },

  /** Dynamic list of authorized customers and access keys */
  /*
  customerApi: {
    updateFunction: myFunction,
    updateInterval: 300, // seconds
  },
  */

  /** Static list of authorized customers and access keys */
  customers: [
    {
      id: "foo",
      maxPeers: Infinity,
      maxRooms: Infinity,
      accessKeys: [
        {
          publicKey: {
            kid: "AS/SFQ8vLw4d",
            kty: "OKP",
            crv: "Ed25519",
            x: "hbpwECksrfP0fiPv-lMd8xvvHByZQAJS3jhMVxSmvcI",
          },
        },
        {
          publicKey: {
            kid: "AZvhoCg3O2Nr",
            kty: "OKP",
            crv: "Ed25519",
            x: "ZZ2W3mmfJRyRDgtfB6rTWzvXQ-pZCBiNF_0cACF44D0",
          },
        },
      ],
    },
    {
      id: "bar",
      maxPeers: 100,
      maxRooms: Infinity,
      accessKeys: [
        {
          publicKey: {
            kid: "ATpQJeUaWhBz",
            kty: "OKP",
            crv: "Ed25519",
            x: "gXghuQy6iMKQSlx4Wkb3Py_C_BRITPpuEWv3fG_4Yvo",
          },
        },
      ],
    },
  ],

  /** Deny authorization requests with unknown access keys */
  unknownCustomers: "forbidden",

  sfuConfig: {
    /** IP address range from which attached ODIN servers will allow querying metrics */
    metricsServer: "0.0.0.0/0",
    /** Time in seconds between reports from attached ODIN servers */
    updateInterval: 5,
    /** Time in seconds after which an attached ODIN server will be marked as disabled */
    disableTimeout: 7.5,
    /** Time in seconds after which an attached ODIN server will be removed */
    removeTimeout: 600,
  },

  loginToken: {
    /** Time in seconds to use as lifetime for client login tokens */
    lifetime: 300,
  },

  /** Base64 encoded master key */
  masterKey: "VGhpcyBpcyBhIHN1cGVyIHNlY3JldCBtYXN0ZXIga2V5IQ==",
};

export default config;
