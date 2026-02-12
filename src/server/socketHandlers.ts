import { Server } from "socket.io";

import { overlayRoom, workspaceRoom } from "@/lib/socketServer";
import { buildActivePollPayloadByOverlay } from "@/server/realtime";

export const configureSocketHandlers = (io: Server): void => {
  io.on("connection", (socket) => {
    socket.on("overlay:join", async (overlayId: string) => {
      if (!overlayId || typeof overlayId !== "string") {
        return;
      }

      socket.join(overlayRoom(overlayId));

      const payload = await buildActivePollPayloadByOverlay(overlayId);
      if (payload) {
        socket.emit("poll:update", payload);
        socket.emit("poll:state", {
          pollId: payload.pollId,
          state: payload.state,
          endsAt: payload.endsAt
        });
      }
    });

    socket.on("workspace:join", (workspaceId: string) => {
      if (!workspaceId || typeof workspaceId !== "string") {
        return;
      }

      socket.join(workspaceRoom(workspaceId));
    });
  });
};

