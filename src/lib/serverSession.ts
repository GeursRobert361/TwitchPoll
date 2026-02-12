import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { verifySessionToken, type SessionClaims } from "@/lib/auth";

export type ServerWorkspaceContext = {
  session: SessionClaims;
  workspace: {
    id: string;
    ownerId: string;
    channelLogin: string;
    channelDisplayName: string;
    channelConfirmedAt: Date | null;
    overlaySlug: string;
    botFilterEnabled: boolean;
    blacklistJson: string | null;
  };
  isOwner: boolean;
  moderator: {
    id: string;
    displayName: string;
    revokedAt: Date | null;
  } | null;
} | null;

export const getServerSession = async (): Promise<SessionClaims | null> => {
  const token = cookies().get(env.sessionCookie)?.value;
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
};

export const getServerWorkspaceContext = async (): Promise<ServerWorkspaceContext> => {
  const session = await getServerSession();
  if (!session) {
    return null;
  }

  const workspace = await prisma.channelWorkspace.findUnique({
    where: {
      id: session.workspaceId
    },
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
    return null;
  }

  if (session.role === "OWNER") {
    if (!session.userId || session.userId !== workspace.ownerId) {
      return null;
    }

    return {
      session,
      workspace,
      isOwner: true,
      moderator: null
    };
  }

  if (!session.moderatorId) {
    return null;
  }

  const moderator = await prisma.moderator.findUnique({
    where: { id: session.moderatorId },
    select: {
      id: true,
      displayName: true,
      revokedAt: true
    }
  });

  if (!moderator || moderator.revokedAt) {
    return null;
  }

  return {
    session,
    workspace,
    isOwner: false,
    moderator
  };
};

