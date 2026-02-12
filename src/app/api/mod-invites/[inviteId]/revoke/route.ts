import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: { inviteId: string } };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request, { ownerOnly: true });

    const invite = await prisma.modInvite.findFirst({
      where: {
        id: params.inviteId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
        revokedAt: true
      }
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.revokedAt) {
      return NextResponse.json({ ok: true });
    }

    await prisma.modInvite.update({
      where: { id: invite.id },
      data: {
        revokedAt: new Date()
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

