import { PollState } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: { pollId: string } };

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
