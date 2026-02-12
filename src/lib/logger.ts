const withTimestamp = (level: string, message: string, meta?: unknown): void => {
  const prefix = `[${new Date().toISOString()}] [${level}]`;

  if (meta !== undefined) {
    console.log(prefix, message, meta);
    return;
  }

  console.log(prefix, message);
};

export const logger = {
  info: (message: string, meta?: unknown) => withTimestamp("INFO", message, meta),
  warn: (message: string, meta?: unknown) => withTimestamp("WARN", message, meta),
  error: (message: string, meta?: unknown) => withTimestamp("ERROR", message, meta)
};

