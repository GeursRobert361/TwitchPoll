import { PollState } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";
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
        id: true
      }
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.vote.deleteMany({ where: { pollId: poll.id } }),
      prisma.poll.update({
        where: { id: poll.id },
        data: {
          state: PollState.DRAFT,
          startsAt: null,
          endsAt: null,
          resultsPublished: false,
          updatedAt: new Date()
        }
      })
    ]);

    await broadcastPollState(poll.id);
    await broadcastPollUpdate(poll.id);

    const polls = await listWorkspacePolls(context.workspace.id);
    const reset = polls.find((entry) => entry.id === poll.id) ?? null;

    return NextResponse.json({ poll: reset, polls });
  } catch (error) {
    return handleApiError(error);
  }
}

