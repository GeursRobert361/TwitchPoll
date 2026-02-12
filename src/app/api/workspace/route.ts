import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { handleApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

const updateSchema = z.object({
  channelLogin: z.string().trim().min(3).max(25).optional(),
  channelDisplayName: z.string().trim().min(1).max(50).optional(),
  botFilterEnabled: z.boolean().optional(),
  blacklistUsers: z.array(z.string().trim().min(1).max(30)).max(100).optional(),
  confirmChannel: z.boolean().optional()
});

const serializeWorkspace = (workspace: {
  id: string;
  channelLogin: string;
  channelDisplayName: string;
  overlaySlug: string;
  channelConfirmedAt: Date | null;
  botFilterEnabled: boolean;
  blacklistJson: string | null;
}) => ({
  id: workspace.id,
  channelLogin: workspace.channelLogin,
  channelDisplayName: workspace.channelDisplayName,
  overlaySlug: workspace.overlaySlug,
  overlayUrl: `${env.baseUrl}/o/${workspace.overlaySlug}`,
  channelConfirmedAt: workspace.channelConfirmedAt ? workspace.channelConfirmedAt.toISOString() : null,
  botFilterEnabled: workspace.botFilterEnabled,
  blacklistUsers: workspace.blacklistJson ? (JSON.parse(workspace.blacklistJson) as string[]) : []
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);

    const workspace = await prisma.channelWorkspace.findUnique({
      where: { id: context.workspace.id },
      select: {
        id: true,
        channelLogin: true,
        channelDisplayName: true,
        overlaySlug: true,
        channelConfirmedAt: true,
        botFilterEnabled: true,
        blacklistJson: true
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json({
      workspace: serializeWorkspace(workspace),
      role: context.isOwner ? "OWNER" : "MOD",
      moderator: context.moderator
        ? {
            id: context.moderator.id,
            displayName: context.moderator.displayName
          }
        : null
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request, { ownerOnly: true });
    const payload = updateSchema.parse(await request.json());

    const channelLogin = payload.channelLogin
      ? payload.channelLogin.replace(/^#/, "").toLowerCase()
      : undefined;

    const updateData: {
      channelLogin?: string;
      channelDisplayName?: string;
      botFilterEnabled?: boolean;
      blacklistJson?: string;
      channelConfirmedAt?: Date;
      updatedAt: Date;
    } = {
      updatedAt: new Date()
    };

    if (channelLogin !== undefined) {
      updateData.channelLogin = channelLogin;
    }

    if (payload.channelDisplayName !== undefined) {
      updateData.channelDisplayName = payload.channelDisplayName;
    }

    if (payload.botFilterEnabled !== undefined) {
      updateData.botFilterEnabled = payload.botFilterEnabled;
    }

    if (payload.blacklistUsers !== undefined) {
      const cleaned = [...new Set(payload.blacklistUsers.map((item) => item.toLowerCase()))];
      updateData.blacklistJson = JSON.stringify(cleaned);
    }

    if (payload.confirmChannel) {
      updateData.channelConfirmedAt = new Date();
    }

    const workspace = await prisma.channelWorkspace.update({
      where: { id: context.workspace.id },
      data: updateData,
      select: {
        id: true,
        channelLogin: true,
        channelDisplayName: true,
        overlaySlug: true,
        channelConfirmedAt: true,
        botFilterEnabled: true,
        blacklistJson: true
      }
    });

    return NextResponse.json({ workspace: serializeWorkspace(workspace) });
  } catch (error) {
    return handleApiError(error);
  }
}

