import type { NextRequest } from "next/server";
import { Moderator } from "@prisma/client";

import { SessionClaims, verifySessionToken } from "@/lib/auth";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

type SessionWorkspace = {
  id: string;
  ownerId: string;
  channelLogin: string;
  channelDisplayName: string;
  channelConfirmedAt: Date | null;
  overlaySlug: string;
  botFilterEnabled: boolean;
  blacklistJson: string | null;
};

export type WorkspaceSessionContext = {
  session: SessionClaims;
  workspace: SessionWorkspace;
  moderator: Moderator | null;
  isOwner: boolean;
};

export const getSessionFromRequest = async (request: NextRequest): Promise<SessionClaims | null> => {
  const token = request.cookies.get(env.sessionCookie)?.value;
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
};

export const requireWorkspaceSession = async (
  request: NextRequest,
  opts: { ownerOnly?: boolean } = {}
): Promise<WorkspaceSessionContext> => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new ApiError(401, "Not authenticated");
  }

  const workspace = await prisma.channelWorkspace.findUnique({
    where: { id: session.workspaceId },
    select: {
      id: true,
      ownerId: true,
      channelLogin: true,
      channelDisplayName: true,
      channelConfirmedAt: true,
      overlaySlug: true,
      botFilterEnabled: true,
      blacklistJson: true
    }
  });

  if (!workspace) {
    throw new ApiError(403, "Workspace not found for session");
  }

  if (session.role === "OWNER") {
    if (!session.userId || session.userId !== workspace.ownerId) {
      throw new ApiError(403, "Invalid owner session");
    }

    return {
      session,
      workspace,
      moderator: null,
      isOwner: true
    };
  }

  if (opts.ownerOnly) {
    throw new ApiError(403, "Owner access required");
  }

  if (!session.moderatorId) {
    throw new ApiError(403, "Invalid moderator session");
  }

  const moderator = await prisma.moderator.findUnique({
    where: { id: session.moderatorId }
  });

  if (!moderator || moderator.workspaceId !== workspace.id || moderator.revokedAt) {
    throw new ApiError(403, "Moderator access revoked");
  }

  await prisma.moderator.update({
    where: { id: moderator.id },
    data: { lastSeenAt: new Date() }
  });

  return {
    session,
    workspace,
    moderator,
    isOwner: false
  };
};

