import { DuplicateVotePolicy, PollState, VoteMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";
const MAX_POLL_DURATION_SECONDS = 15 * 60;

type Params = { params: { pollId: string } };

const normalizeKeyword = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

const defaultKeywordForMode = (voteMode: VoteMode, index: number): string => {
  if (voteMode === VoteMode.NUMBERS) {
    return String(index + 1);
  }

  if (voteMode === VoteMode.LETTERS) {
    return String.fromCharCode(97 + index);
  }

  return `option_${index + 1}`;
};

const updateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  voteMode: z.nativeEnum(VoteMode).optional(),
  durationSeconds: z.number().int().positive().max(MAX_POLL_DURATION_SECONDS).nullable().optional(),
  duplicateVotePolicy: z.nativeEnum(DuplicateVotePolicy).optional(),
  allowVoteChange: z.boolean().optional(),
  options: z.array(
    z.object({
      label: z.string().trim().min(1).max(80),
      keyword: z.string().trim().min(1).max(30).optional()
    })
  ).min(2).max(8).optional()
});

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);
    const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid duration. Use null or an integer between 1 and ${MAX_POLL_DURATION_SECONDS}.` },
        { status: 400 }
      );
    }

    const poll = await prisma.poll.findFirst({
      where: {
        id: params.pollId,
        workspaceId: context.workspace.id
      },
      select: {
        id: true,
        state: true,
        voteMode: true
      }
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    const isFullEditRequest = parsed.data.title !== undefined
      || parsed.data.voteMode !== undefined
      || parsed.data.duplicateVotePolicy !== undefined
      || parsed.data.allowVoteChange !== undefined
      || parsed.data.options !== undefined;

    if (!isFullEditRequest && parsed.data.durationSeconds === undefined) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 });
    }

    if (isFullEditRequest && poll.state !== PollState.DRAFT) {
      return NextResponse.json({ error: "Only draft polls can be edited" }, { status: 400 });
    }

    if (parsed.data.durationSeconds !== undefined && poll.state === PollState.LIVE) {
      return NextResponse.json({ error: "Stop live poll before changing duration" }, { status: 400 });
    }

    const updateData: {
      title?: string;
      voteMode?: VoteMode;
      durationSeconds?: number | null;
      duplicateVotePolicy?: DuplicateVotePolicy;
      allowVoteChange?: boolean;
      options?: {
        deleteMany: Record<string, never>;
        create: Array<{
          label: string;
          keyword: string;
          position: number;
        }>;
      };
      updatedAt: Date;
    } = {
      updatedAt: new Date()
    };

    if (parsed.data.title !== undefined) {
      updateData.title = parsed.data.title;
    }

    if (parsed.data.voteMode !== undefined) {
      updateData.voteMode = parsed.data.voteMode;
    }

    if (parsed.data.durationSeconds !== undefined) {
      updateData.durationSeconds = parsed.data.durationSeconds;
    }

    if (parsed.data.duplicateVotePolicy !== undefined) {
      updateData.duplicateVotePolicy = parsed.data.duplicateVotePolicy;
    }

    if (parsed.data.allowVoteChange !== undefined) {
      updateData.allowVoteChange = parsed.data.allowVoteChange;
    }

    if (parsed.data.options !== undefined) {
      const effectiveVoteMode = parsed.data.voteMode ?? poll.voteMode;
      const normalizedOptions = parsed.data.options.map((option, index) => {
        const fallback = defaultKeywordForMode(effectiveVoteMode, index);
        const keywordInput = option.keyword?.trim();
        const keyword = normalizeKeyword(keywordInput && keywordInput.length > 0 ? keywordInput : fallback) || fallback;

        return {
          label: option.label,
          keyword,
          position: index + 1
        };
      });

      const duplicateKeywords = normalizedOptions
        .map((option) => option.keyword)
        .filter((keyword, index, all) => all.indexOf(keyword) !== index);

      if (duplicateKeywords.length > 0) {
        return NextResponse.json({ error: "Option keywords must be unique" }, { status: 400 });
      }

      updateData.options = {
        deleteMany: {},
        create: normalizedOptions
      };
    }

    await prisma.poll.update({
      where: {
        id: poll.id
      },
      data: updateData
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
