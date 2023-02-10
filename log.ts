import { Colors } from "./deps.ts";

import * as log from "https://deno.land/std@0.176.0/log/mod.ts";
import type { LogRecord } from "https://deno.land/std@0.176.0/log/logger.ts";
import { LogLevelNames } from "https://deno.land/std@0.176.0/log/levels.ts";
import type { LevelName } from "https://deno.land/std@0.176.0/log/levels.ts";
import { RoomId } from "./sfuServers.ts";

export { LogLevelNames };
export type { LevelName };

const start = Date.now();

const symbols: { [Level in LevelName]: string } = {
  NOTSET: " ",
  DEBUG: "⚫",
  INFO: "🔵",
  WARNING: "🟡",
  ERROR: "🔴",
  CRITICAL: "💥",
};

export type LogArgs = Record<
  string,
  (string | number | boolean | RoomId | null)
>;

export function debug(msg: string, args?: LogArgs) {
  log.debug(msg, args);
}

export function info(msg: string, args?: LogArgs) {
  log.info(msg, args);
}

export function warning(msg: string, args?: LogArgs) {
  log.warning(msg, args);
}

export function error(msg: string, args?: LogArgs) {
  log.error(msg, args);
}

export function critical(msg: string, args?: LogArgs) {
  log.critical(msg, args);
}

const messageColors: { [Level in LevelName]: ((_: string) => string) } = {
  NOTSET: Colors.reset,
  DEBUG: Colors.dim,
  INFO: Colors.reset,
  WARNING: Colors.reset,
  ERROR: Colors.bold,
  CRITICAL: (text) => Colors.bold(Colors.inverse(Colors.red(text))),
};

export type LogFormat = "pretty" | "json";

export async function setup(level: LevelName, type: LogFormat) {
  const Handler = type == "pretty" ? PrettyHandler : JsonHandler;
  await log.setup({
    handlers: {
      default: new Handler(level),
    },
    loggers: {
      default: {
        level,
        handlers: ["default"],
      },
    },
  });
}

class PrettyHandler extends log.handlers.ConsoleHandler {
  format(logRecord: LogRecord): string {
    const level = logRecord.levelName as LevelName;
    const time = relativeTime(logRecord.datetime);
    return `${Colors.reset(time)} ${symbols[level]} ${
      messageColors[level](logRecord.msg)
    }${formatArgs({ args: logRecord.args[0] as LogArgs, colors: true })}`;
  }
}

class JsonHandler extends log.handlers.ConsoleHandler {
  format(logRecord: LogRecord): string {
    const severity = logRecord.levelName;
    const ts = logRecord.datetime.toISOString();
    const msg = logRecord.msg;
    const args = logRecord.args[0] as LogArgs;
    return JSON.stringify({
      ts,
      severity,
      msg,
      ...args,
    });
  }
}

function formatArgs(
  { args, colors }: { args: LogArgs | undefined; colors: boolean },
): string {
  if (args === undefined) {
    return "";
  } else {
    return Deno.inspect(args, {
      compact: false,
      colors,
      trailingComma: true,
    }).slice(1, -2);
  }
}

function divmod(numerator: number, denominator: number): [number, number] {
  return [Math.floor(numerator / denominator), numerator % denominator];
}

function relativeTime(date: Date): string {
  let milliseconds, offset = date.valueOf() - start;
  [offset, milliseconds] = divmod(offset, 1000);
  const [minutes, seconds] = divmod(offset, 60);
  return `${minutes.toString().padStart(4, "0")}:${
    seconds.toString().padStart(2, "0")
  }.${milliseconds.toString().padStart(4, "0")}`;
}
