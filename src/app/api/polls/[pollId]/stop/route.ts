import { PollState } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";
import { announcePollEnded } from "@/server/pollAnnouncements";
import { broadcastPollState, broadcastPollUpdate } from "@/server/realtime";

export const runtime = "nodejs";

type Params = { params: { pollId: string } };

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);
    const poll = await prisma.poll.findFirst({
      where: {
        id: params.pollId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
        state: true
      }
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    if (poll.state !== PollState.LIVE) {
      return NextResponse.json({ error: "Only live polls can be stopped" }, { status: 400 });
    }

    await prisma.poll.update({
      where: { id: poll.id },
      data: {
        state: PollState.ENDED,
        endsAt: new Date(),
        updatedAt: new Date()
      }
    });

    await broadcastPollState(poll.id);
    await broadcastPollUpdate(poll.id);
    await announcePollEnded(poll.id, context.workspace.channelLogin);

    const polls = await listWorkspacePolls(context.workspace.id);
    const stopped = polls.find((entry) => entry.id === poll.id) ?? null;

    return NextResponse.json({ poll: stopped, polls });
  } catch (error) {
    return handleApiError(error);
  }
}

