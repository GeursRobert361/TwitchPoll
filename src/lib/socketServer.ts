import { Server } from "socket.io";

let io: Server | null = null;

export const setSocketServer = (server: Server): void => {
  io = server;
};

export const getSocketServer = (): Server | null => io;

export const workspaceRoom = (workspaceId: string): string => `workspace:${workspaceId}`;
export const overlayRoom = (overlaySlug: string): string => `overlay:${overlaySlug}`;

