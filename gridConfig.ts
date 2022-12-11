import config from "./config.ts";
import { GridConfig } from "./gridConfigShema.ts";

const gridConfig: GridConfig = {
  supervisor: {
    report_interval: config.sfuConfig.updateInterval * 1000, /* s -> ms */
  },
  quic: {
    keep_alive_interval: 5000,
    idle_timeout: 30000,
    pre_send_timeout: 500,
    migration: true,
  },
  http: {
    timeout: 10000,
    ping_interval: 5000,
  },
  metrics: {
    binding: "0.0.0.0:9000",
    idle_timeout: 3600000,
    global_labels: { deployment: "public" },
    allowed: [`${config.sfuConfig.metricsServer}`, "127.0.0.1/8", "::1/128"],
  },
  limit: {
    peer: {
      incoming_messages: {
        rate: 10,
        capacity: 50,
        overflow: 20,
      },
    },
  },
};

export default gridConfig;
