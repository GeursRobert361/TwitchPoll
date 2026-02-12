import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: { modId: string } };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request, { ownerOnly: true });

    const moderator = await prisma.moderator.findFirst({
      where: {
        id: params.modId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
        revokedAt: true
      }
    });

    if (!moderator) {
      return NextResponse.json({ error: "Moderator not found" }, { status: 404 });
    }

    if (!moderator.revokedAt) {
      await prisma.moderator.update({
        where: { id: moderator.id },
        data: {
          revokedAt: new Date()
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

