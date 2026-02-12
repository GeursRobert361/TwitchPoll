import { NextResponse } from "next/server";
import { DuplicateVotePolicy, PollState, VoteMode } from "@prisma/client";

import { attachSessionCookie, createSessionToken } from "@/lib/auth";
import { generateOverlaySlug } from "@/lib/crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  if (!env.demoMode) {
    return NextResponse.json({ error: "Demo mode is disabled" }, { status: 403 });
  }

  const user = await prisma.user.upsert({
    where: { twitchUserId: "demo-owner" },
    create: {
      twitchUserId: "demo-owner",
      login: "demo_streamer",
      displayName: "Demo Streamer",
      avatarUrl: null
    },
    update: {
      login: "demo_streamer",
      displayName: "Demo Streamer"
    }
  });

  let workspace = await prisma.channelWorkspace.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" }
  });

  if (!workspace) {
    workspace = await prisma.channelWorkspace.create({
      data: {
        ownerId: user.id,
        channelLogin: "demo_streamer",
        channelDisplayName: "Demo Streamer",
        channelTwitchUserId: "demo-owner",
        overlaySlug: generateOverlaySlug(),
        channelConfirmedAt: new Date()
      }
    });
  } else if (!workspace.channelConfirmedAt) {
    workspace = await prisma.channelWorkspace.update({
      where: { id: workspace.id },
      data: {
        channelConfirmedAt: new Date()
      }
    });
  }

  const livePoll = await prisma.poll.findFirst({
    where: {
      workspaceId: workspace.id,
      state: PollState.LIVE
    },
    select: {
      id: true
    }
  });

  if (!livePoll) {
    const now = new Date();
    const endsAt = new Date(now.getTime() + 10 * 60 * 1000);

    await prisma.poll.create({
      data: {
        workspaceId: workspace.id,
        title: "Welke game starten we nu?",
        voteMode: VoteMode.NUMBERS,
        state: PollState.LIVE,
        startsAt: now,
        endsAt,
        durationSeconds: 10 * 60,
        duplicateVotePolicy: DuplicateVotePolicy.LATEST,
        allowVoteChange: true,
        resultsPublished: true,
        createdByRole: "OWNER",
        createdByLabel: "Demo Streamer",
        options: {
          create: [
            { label: "Minecraft", keyword: "minecraft", position: 1 },
            { label: "Fortnite", keyword: "fortnite", position: 2 },
            { label: "Valorant", keyword: "valorant", position: 3 },
            { label: "Rocket League", keyword: "rocket_league", position: 4 }
          ]
        }
      }
    });
  }

  const token = await createSessionToken({
    role: "OWNER",
    userId: user.id,
    workspaceId: workspace.id,
    displayName: user.displayName
  });

  const response = NextResponse.json({ ok: true, redirectTo: "/dashboard" });
  attachSessionCookie(response, token);
  return response;
}

