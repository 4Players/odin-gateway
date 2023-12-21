import * as Colors from "std/fmt/colors.ts";
import {
  critical,
  debug,
  error,
  info,
  setup as _setup,
  warning,
} from "std/log/mod.ts";
import { ConsoleHandler } from "std/log/handlers.ts";
import { LogRecord } from "std/log/logger.ts";
import { LevelName, LogLevelNames } from "std/log/levels.ts";
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

export { critical, debug, error, info, warning };

const messageColors: { [Level in LevelName]: ((_: string) => string) } = {
  NOTSET: Colors.reset,
  DEBUG: Colors.dim,
  INFO: Colors.reset,
  WARNING: Colors.reset,
  ERROR: Colors.bold,
  CRITICAL: (text) => Colors.bold(Colors.inverse(Colors.red(text))),
};

export type LogFormat = "pretty" | "json";

export function setup(level: LevelName, type: LogFormat) {
  const Handler = type == "pretty" ? PrettyHandler : JsonHandler;
  _setup({
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

class PrettyHandler extends ConsoleHandler {
  format(logRecord: LogRecord): string {
    const level = logRecord.levelName as LevelName;
    const time = relativeTime(logRecord.datetime);
    return `${Colors.reset(time)} ${symbols[level]} ${
      messageColors[level](logRecord.msg)
    }${formatArgs({ args: logRecord.args[0] as LogArgs, colors: true })}`;
  }
}

class JsonHandler extends ConsoleHandler {
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
