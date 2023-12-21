import { failWith, JsonValue } from "./utils.ts";
import * as z from "zod";

export function validate<T extends z.ZodTypeAny>(
  value: unknown,
  schema: T,
): asserts value is z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success == false) {
    failWith(result.error.message, -32600, result.error.flatten() as JsonValue);
  }
}

export const BytesSchema = z.array(z.number());

export const TimeStampSchema = z.object({
  secs: z.number(),
  nanos: z.number(),
});

export const RoomIdSchema = z.tuple([z.string(), z.string()]);
