import { JWK } from "./jwk.ts";
import config from "./config.ts";

const recommendedConfig = {
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

export function extendGridConfig(
  config: Record<string, unknown>,
  authorizationKey: JWK,
): Record<string, unknown> {
  merge(config, recommendedConfig);
  merge(config, { authorization: { keys: [authorizationKey] } });
  return config;
}

function merge(
  object: Record<string, unknown>,
  extension: Record<string, unknown>,
) {
  for (const name in extension) {
    const childObject = object[name];
    const childExtension = extension[name];
    if (Array.isArray(childObject) && Array.isArray(childExtension)) {
      for (const item of childExtension) {
        childObject.push(item);
      }
    } else if (isPlainObject(childObject) && isPlainObject(childExtension)) {
      merge(childObject, childExtension);
    } else if (childObject == null) {
      object[name] = childExtension;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
