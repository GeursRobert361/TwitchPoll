import { DuplicateVotePolicy, VoteMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

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

const createPollSchema = z.object({
  title: z.string().trim().min(3).max(200),
  voteMode: z.nativeEnum(VoteMode),
  durationSeconds: z.number().int().positive().max(60 * 60).nullable().optional(),
  duplicateVotePolicy: z.nativeEnum(DuplicateVotePolicy).default(DuplicateVotePolicy.LATEST),
  allowVoteChange: z.boolean().default(true),
  options: z.array(
    z.object({
      label: z.string().trim().min(1).max(80),
      keyword: z.string().trim().min(1).max(30).optional()
    })
  ).min(2).max(6)
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);
    const polls = await listWorkspacePolls(context.workspace.id);

    return NextResponse.json({
      polls,
      role: context.isOwner ? "OWNER" : "MOD"
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request);
    const payload = createPollSchema.parse(await request.json());

    const options = payload.options.map((option, index) => {
      const fallback = defaultKeywordForMode(payload.voteMode, index);
      const keywordInput = option.keyword?.trim();
      const keyword = normalizeKeyword(keywordInput && keywordInput.length > 0 ? keywordInput : fallback) || fallback;

      return {
        label: option.label,
        keyword,
        position: index + 1
      };
    });

    const duplicateKeywords = options
      .map((option) => option.keyword)
      .filter((keyword, index, all) => all.indexOf(keyword) !== index);

    if (duplicateKeywords.length > 0) {
      return NextResponse.json(
        {
          error: "Option keywords must be unique"
        },
        {
          status: 400
        }
      );
    }

    const createdPoll = await prisma.poll.create({
      data: {
        workspaceId: context.workspace.id,
        title: payload.title,
        voteMode: payload.voteMode,
        durationSeconds: payload.durationSeconds ?? null,
        duplicateVotePolicy: payload.duplicateVotePolicy,
        allowVoteChange: payload.allowVoteChange,
        createdByRole: context.isOwner ? "OWNER" : "MOD",
        createdByLabel: context.isOwner
          ? context.session.displayName ?? "Owner"
          : context.moderator?.displayName ?? "Moderator",
        options: {
          create: options
        }
      },
      select: {
        id: true
      }
    });

    const polls = await listWorkspacePolls(context.workspace.id);
    const poll = polls.find((entry) => entry.id === createdPoll.id) ?? null;

    return NextResponse.json({ poll, polls });
  } catch (error) {
    return handleApiError(error);
  }
}

