import { PollState } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";
import { broadcastPollState, broadcastPollUpdate } from "@/server/realtime";
import { twitchIrcClient } from "@/server/twitchIrcClient";

export const runtime = "nodejs";

type Params = { params: { pollId: string } };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);
    const pollId = params.pollId;

    const poll = await prisma.poll.findFirst({
      where: {
        id: pollId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
        state: true,
        durationSeconds: true
      }
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    if (!context.workspace.channelConfirmedAt) {
      return NextResponse.json({ error: "Confirm channel first" }, { status: 400 });
    }

    if (poll.state !== PollState.DRAFT) {
      return NextResponse.json({ error: "Only draft polls can be started" }, { status: 400 });
    }

    const now = new Date();

    const previouslyPublished = await prisma.poll.findMany({
      where: {
        workspaceId: context.workspace.id,
        id: { not: poll.id },
        resultsPublished: true
      },
      select: { id: true }
    });

    const previouslyLive = await prisma.poll.findMany({
      where: {
        workspaceId: context.workspace.id,
        state: PollState.LIVE,
        id: { not: poll.id }
      },
      select: { id: true }
    });

    if (previouslyLive.length > 0) {
      await prisma.poll.updateMany({
        where: {
          id: {
            in: previouslyLive.map((entry) => entry.id)
          }
        },
        data: {
          state: PollState.ENDED,
          resultsPublished: false,
          updatedAt: now,
          endsAt: now
        }
      });
    }

    if (previouslyPublished.length > 0) {
      await prisma.poll.updateMany({
        where: {
          id: {
            in: previouslyPublished.map((entry) => entry.id)
          }
        },
        data: {
          resultsPublished: false,
          updatedAt: now
        }
      });
    }

    const endsAt = poll.durationSeconds ? new Date(now.getTime() + poll.durationSeconds * 1000) : null;

    await prisma.poll.update({
      where: { id: poll.id },
      data: {
        state: PollState.LIVE,
        resultsPublished: true,
        startsAt: now,
        endsAt,
        updatedAt: now
      }
    });

    twitchIrcClient.joinChannel(context.workspace.channelLogin);

    for (const endedPoll of previouslyLive) {
      await broadcastPollState(endedPoll.id);
      await broadcastPollUpdate(endedPoll.id);
    }

    const previouslyLiveIds = new Set(previouslyLive.map((entry) => entry.id));
    for (const unpublishedPoll of previouslyPublished) {
      if (!previouslyLiveIds.has(unpublishedPoll.id)) {
        await broadcastPollUpdate(unpublishedPoll.id);
      }
    }

    await broadcastPollState(poll.id);
    await broadcastPollUpdate(poll.id);

    const polls = await listWorkspacePolls(context.workspace.id);
    const started = polls.find((entry) => entry.id === poll.id) ?? null;

    return NextResponse.json({ poll: started, polls });
  } catch (error) {
    return handleApiError(error);
  }
}
