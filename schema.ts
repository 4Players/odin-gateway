import { failWith } from "./deps.ts";

export const maybe = Symbol();
export type Maybe = typeof maybe;

interface FieldSchema<Type extends keyof FieldSchemas> {
  type: Type;
}
interface ObjectSchema {
  type: "Object";
  fields: Record<string, Schema>;
}
interface ArraySchema {
  array?: true | false | Maybe;
}

interface OptionalSchema {
  optional?: true | false;
}

type Schema =
  & (ObjectSchema | FieldSchema<keyof FieldSchemas>)
  & ArraySchema
  & OptionalSchema;

interface FieldSchemas {
  String: string;
  Number: number;
  RoomId: [string, string];
  Record: Record<string, unknown>;
  Bytes: number[];
}

type UnwrapFieldType<
  Type extends keyof FieldSchemas,
> = FieldSchemas[Type];

type UnwrapObjectType<T extends Schema> = T extends ObjectSchema ? {
    [N in keyof T["fields"]]: Unwrap<T["fields"][N]>;
  }
  : T["type"] extends keyof FieldSchemas ? UnwrapFieldType<T["type"]>
  : never;

type UnwrapArray<T extends Schema> = T["array"] extends Maybe
  ? (Array<UnwrapObjectType<T>> | UnwrapObjectType<T>)
  : T["array"] extends true ? Array<UnwrapObjectType<T>>
  : UnwrapObjectType<T>;

type UnwrapOptional<T extends Schema> = T["optional"] extends true
  ? UnwrapArray<T> | undefined
  : UnwrapArray<T>;

export type Unwrap<T extends Schema> = UnwrapOptional<T>;

export function create<T extends Schema>(schema: T): T {
  return schema;
}

export function validate<T extends Schema>(
  value: unknown,
  root: string,
  schema: T,
): asserts value is Unwrap<T> {
  innerCheck(value, schema, [root]);
}

function innerCheck<T extends Schema>(
  value: unknown,
  schema: T,
  path: Array<string | number>,
) {
  if (
    schema.array === true || (schema.array === maybe && Array.isArray(value))
  ) {
    assertPath(Array.isArray(value), path, "is not an array");
    for (let i = 0; i < value.length; ++i) {
      path.push(i);
      innerCheckValue(value[i], schema, path);
      path.pop();
    }
  } else {
    innerCheckValue(value, schema, path);
  }
}

function innerCheckValue<T extends Schema>(
  value: unknown,
  schema: T,
  path: Array<string | number>,
) {
  if (schema.optional && (value === undefined || value === null)) {
    value = undefined;
    return;
  }
  if (schema.type === "Object") {
    assertPath(
      typeof value === "object" && Array.isArray(value) === false,
      path,
      "is not an object",
    );
    assertPath(
      value !== null && value !== undefined,
      path,
      "must not be null",
    );
    for (const field of Object.keys(schema.fields)) {
      const fieldSchema = schema.fields[field];
      path.push(field);
      if (field in value) {
        const fieldValue: unknown = (value as Record<string, unknown>)[field];
        innerCheck(fieldValue, fieldSchema, path);
      } else {
        assertPath(fieldSchema.optional, path, "is missing");
      }
      path.pop();
    }
  } else {
    switch (schema.type) {
      case "Number":
        assertPath(typeof value === "number", path, "is not a number");
        break;
      case "String":
        assertPath(typeof value === "string", path, "is not a string");
        break;
      case "RoomId":
        assertPath(
          Array.isArray(value) && value.length == 2 &&
            typeof value[0] === "string" && typeof value[1] === "string",
          path,
          "is not a room-id",
        );
        break;
      case "Record":
        assertPath(
          typeof value === "object" && Array.isArray(value) == false,
          path,
          "is not a record",
        );
        break;
      case "Bytes":
        assertPath(
          Array.isArray(value) &&
            value.every((element) =>
              typeof element === "number" && element >= 0 && element <= 255
            ),
          path,
          "is not a byte array",
        );
        break;
    }
  }
}

function assertPath(
  expr: unknown,
  path: Array<string | number>,
  msg: string,
): asserts expr {
  if (!expr) {
    const data = {
      field: path.join("."),
      reason: msg,
    };
    failWith("invalid request", -32600, data);
  }
}

type ObjectProperty<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T];

export function filterObject<T extends Record<string, unknown>>(
  obj: T,
  func: (
    prop: ObjectProperty<T>,
    i: number,
    arr: ObjectProperty<T>[],
  ) => boolean,
) {
  return Object.fromEntries(
    (Object.entries(obj) as ObjectProperty<T>[]).filter(func),
  ) as T;
}
