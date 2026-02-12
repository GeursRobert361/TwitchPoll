import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

const BACKUP_FORMAT = "twitch-poll-overlay-polls-backup";
const BACKUP_VERSION = 1;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request, { ownerOnly: true });

    const polls = await prisma.poll.findMany({
      where: {
        workspaceId: context.workspace.id
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        title: true,
        voteMode: true,
        durationSeconds: true,
        duplicateVotePolicy: true,
        allowVoteChange: true,
        options: {
          orderBy: {
            position: "asc"
          },
          select: {
            label: true,
            keyword: true,
            position: true
          }
        }
      }
    });

    const payload = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: {
        channelLogin: context.workspace.channelLogin,
        channelDisplayName: context.workspace.channelDisplayName
      },
      polls
    };

    const safeChannel = context.workspace.channelLogin.replace(/[^a-z0-9_-]/gi, "_");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `polls-${safeChannel}-${stamp}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

