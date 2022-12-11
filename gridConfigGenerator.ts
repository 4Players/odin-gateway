import recommendedConfig from "./gridConfig.ts";
import { JWK } from "./jwk.ts";

export function extendGridConfig(
  config: Record<string, unknown>,
  authorizationKey: JWK,
): Record<string, unknown> {
  merge(config, recommendedConfig as Record<string, unknown>);
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
