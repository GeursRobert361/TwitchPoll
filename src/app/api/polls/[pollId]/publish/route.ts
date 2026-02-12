import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";
import { broadcastPollUpdate } from "@/server/realtime";

export const runtime = "nodejs";

type Params = { params: { pollId: string } };

const schema = z.object({
  published: z.boolean().optional()
});

export async function POST(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);
    const body = schema.parse(await request.json().catch(() => ({})));

    const poll = await prisma.poll.findFirst({
      where: {
        id: params.pollId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
        resultsPublished: true
      }
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    const nextPublished = body.published ?? !poll.resultsPublished;

    const otherPublished = nextPublished
      ? await prisma.poll.findMany({
          where: {
            workspaceId: context.workspace.id,
            id: { not: poll.id },
            resultsPublished: true
          },
          select: {
            id: true
          }
        })
      : [];

    if (otherPublished.length > 0) {
      await prisma.poll.updateMany({
        where: {
          id: {
            in: otherPublished.map((entry) => entry.id)
          }
        },
        data: {
          resultsPublished: false,
          updatedAt: new Date()
        }
      });
    }

    await prisma.poll.update({
      where: {
        id: poll.id
      },
      data: {
        resultsPublished: nextPublished,
        updatedAt: new Date()
      }
    });

    for (const unpublished of otherPublished) {
      await broadcastPollUpdate(unpublished.id);
    }

    await broadcastPollUpdate(poll.id);

    const polls = await listWorkspacePolls(context.workspace.id);
    const updated = polls.find((entry) => entry.id === poll.id) ?? null;

    return NextResponse.json({ poll: updated, polls });
  } catch (error) {
    return handleApiError(error);
  }
}

