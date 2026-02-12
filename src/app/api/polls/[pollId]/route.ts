import { PollState } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: { pollId: string } };
const updateSchema = z.object({
  durationSeconds: z.number().int().positive().max(60 * 60).nullable()
});

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);
    const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid duration. Use null or an integer between 1 and 3600." }, { status: 400 });
    }

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

    if (poll.state === PollState.LIVE) {
      return NextResponse.json({ error: "Stop live poll before changing duration" }, { status: 400 });
    }

    await prisma.poll.update({
      where: {
        id: poll.id
      },
      data: {
        durationSeconds: parsed.data.durationSeconds,
        updatedAt: new Date()
      }
    });

    const polls = await listWorkspacePolls(context.workspace.id);
    const updatedPoll = polls.find((entry) => entry.id === poll.id) ?? null;
    return NextResponse.json({ poll: updatedPoll, polls });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
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

    if (poll.state === PollState.LIVE) {
      return NextResponse.json({ error: "Stop live poll before deleting" }, { status: 400 });
    }

    await prisma.poll.delete({
      where: {
        id: poll.id
      }
    });

    const polls = await listWorkspacePolls(context.workspace.id);
    return NextResponse.json({ ok: true, polls });
  } catch (error) {
    return handleApiError(error);
  }
}
