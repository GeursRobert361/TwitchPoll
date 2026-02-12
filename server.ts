import { createServer } from "node:http";

import express from "express";
import next from "next";
import { Server } from "socket.io";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { setSocketServer } from "@/lib/socketServer";
import { startRuntime, stopRuntime } from "@/server/runtime";
import { configureSocketHandlers } from "@/server/socketHandlers";

const port = Number(process.env.PORT ?? 3000);
const dev = env.nodeEnv !== "production";

const nextApp = next({ dev, hostname: "0.0.0.0", port });
const handle = nextApp.getRequestHandler();

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, stopping runtime`);
  stopRuntime();
  await prisma.$disconnect();
  process.exit(0);
};

const main = async (): Promise<void> => {
  await nextApp.prepare();

  const app = express();
  app.disable("x-powered-by");

  app.all("*", (req, res) => {
    return handle(req, res);
  });

  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: env.baseUrl,
      credentials: true
    }
  });

  setSocketServer(io);
  configureSocketHandlers(io);
  startRuntime();

  httpServer.listen(port, () => {
    logger.info(`Twitch Poll Overlay running on ${env.baseUrl} (port ${port})`);
  });
};

main().catch((error) => {
  logger.error("Failed to boot server", { error });
  process.exit(1);
});

process.on("SIGINT", () => {
  shutdown("SIGINT").catch(() => process.exit(1));
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch(() => process.exit(1));
});

