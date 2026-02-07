type LogLevel = "info" | "error" | "warn" | "debug";

const format = (level: LogLevel, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
};

const formatContext = (context: unknown): string => {
  if (context === undefined || context === null) {
    return "";
  }
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
};

export const logger = {
  info: (message: string, context?: unknown): void => {
    console.log(format("info", message));
    if (context !== undefined) {
      console.log(formatContext(context));
    }
  },
  warn: (message: string, context?: unknown): void => {
    console.warn(format("warn", message));
    if (context !== undefined) {
      console.warn(formatContext(context));
    }
  },
  error: (message: string, error?: unknown): void => {
    if (error instanceof Error) {
      console.error(format("error", `${message} - ${error.message}`));
      if (error.stack) {
        console.error(error.stack);
      }
      return;
    }

    if (typeof error === "string") {
      console.error(format("error", `${message} - ${error}`));
      return;
    }

    if (error !== undefined && error !== null) {
      console.error(format("error", message));
      console.error(formatContext(error));
      return;
    }

    console.error(format("error", message));
  },
  debug: (message: string, context?: unknown): void => {
    if (process.env.NODE_ENV === "development") {
      console.debug(format("debug", message));
      if (context !== undefined) {
        console.debug(formatContext(context));
      }
    }
  },
};
