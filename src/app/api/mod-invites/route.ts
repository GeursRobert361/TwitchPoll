import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateInviteToken, hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { handleApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

const createSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7)
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request, { ownerOnly: true });

    const [moderators, invites] = await Promise.all([
      prisma.moderator.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          displayName: true,
          revokedAt: true,
          lastSeenAt: true,
          createdAt: true
        }
      }),
      prisma.modInvite.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          createdAt: true,
          moderator: {
            select: {
              id: true,
              displayName: true
            }
          }
        }
      })
    ]);

    return NextResponse.json({
      moderators: moderators.map((mod) => ({
        ...mod,
        revokedAt: mod.revokedAt ? mod.revokedAt.toISOString() : null,
        lastSeenAt: mod.lastSeenAt ? mod.lastSeenAt.toISOString() : null,
        createdAt: mod.createdAt.toISOString()
      })),
      invites: invites.map((invite) => ({
        id: invite.id,
        expiresAt: invite.expiresAt.toISOString(),
        usedAt: invite.usedAt ? invite.usedAt.toISOString() : null,
        revokedAt: invite.revokedAt ? invite.revokedAt.toISOString() : null,
        createdAt: invite.createdAt.toISOString(),
        moderator: invite.moderator
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request, { ownerOnly: true });
    const payload = createSchema.parse(await request.json().catch(() => ({})));

    if (!context.session.userId) {
      return NextResponse.json({ error: "Invalid owner session" }, { status: 403 });
    }

    const rawToken = generateInviteToken();
    const invite = await prisma.modInvite.create({
      data: {
        workspaceId: context.workspace.id,
        createdById: context.session.userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + payload.expiresInDays * 24 * 60 * 60 * 1000)
      },
      select: {
        id: true,
        expiresAt: true,
        createdAt: true
      }
    });

    const inviteUrl = `${env.baseUrl}/mod/redeem?token=${rawToken}`;

    return NextResponse.json({
      invite: {
        id: invite.id,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
        token: rawToken,
        url: inviteUrl
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

