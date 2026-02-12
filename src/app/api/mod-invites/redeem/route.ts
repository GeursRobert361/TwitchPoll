import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { attachSessionCookie, createSessionToken } from "@/lib/auth";
import { hashToken } from "@/lib/crypto";
import { handleApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(20),
  displayName: z.string().trim().min(2).max(50)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = schema.parse(await request.json());
    const tokenHash = hashToken(payload.token);

    const invite = await prisma.modInvite.findUnique({
      where: {
        tokenHash
      },
      select: {
        id: true,
        workspaceId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true
      }
    });

    if (!invite) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
    }

    if (invite.revokedAt) {
      return NextResponse.json({ error: "Invite has been revoked" }, { status: 400 });
    }

    if (invite.usedAt) {
      return NextResponse.json({ error: "Invite token already used" }, { status: 400 });
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Invite token expired" }, { status: 400 });
    }

    const moderator = await prisma.moderator.create({
      data: {
        workspaceId: invite.workspaceId,
        displayName: payload.displayName
      },
      select: {
        id: true,
        displayName: true,
        workspaceId: true
      }
    });

    await prisma.modInvite.update({
      where: { id: invite.id },
      data: {
        usedAt: new Date(),
        moderatorId: moderator.id
      }
    });

    const token = await createSessionToken({
      role: "MOD",
      workspaceId: moderator.workspaceId,
      moderatorId: moderator.id,
      displayName: moderator.displayName
    });

    const response = NextResponse.json({ ok: true, redirectTo: "/mod" });
    attachSessionCookie(response, token);

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

