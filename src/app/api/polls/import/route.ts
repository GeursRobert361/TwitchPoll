import { DuplicateVotePolicy, VoteMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/http";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceSession } from "@/lib/session";

export const runtime = "nodejs";

const BACKUP_FORMAT = "twitch-poll-overlay-polls-backup";
const BACKUP_VERSION = 1;

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

const importedPollSchema = z.object({
  title: z.string().trim().min(3).max(200),
  voteMode: z.nativeEnum(VoteMode),
  durationSeconds: z.number().int().positive().max(60 * 60).nullable().optional(),
  duplicateVotePolicy: z.nativeEnum(DuplicateVotePolicy).default(DuplicateVotePolicy.LATEST),
  allowVoteChange: z.boolean().default(true),
  options: z.array(
    z.object({
      label: z.string().trim().min(1).max(80),
      keyword: z.string().trim().min(1).max(30),
      position: z.number().int().min(1).max(8)
    })
  ).min(2).max(8)
});

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  polls: z.array(importedPollSchema).max(500)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const context = await requireWorkspaceSession(request, { ownerOnly: true });
    const payload = backupSchema.parse(await request.json());

    if (payload.polls.length === 0) {
      return NextResponse.json({ importedCount: 0, polls: await listWorkspacePolls(context.workspace.id) });
    }

    await prisma.$transaction(async (tx) => {
      for (const poll of payload.polls) {
        const normalizedOptions = [...poll.options]
          .sort((a, b) => a.position - b.position)
          .map((option, index) => {
            const fallback = defaultKeywordForMode(poll.voteMode, index);
            const keyword = normalizeKeyword(option.keyword) || fallback;

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
          throw new Error(`Duplicate option keywords found in poll "${poll.title}"`);
        }

        await tx.poll.create({
          data: {
            workspaceId: context.workspace.id,
            title: poll.title,
            voteMode: poll.voteMode,
            durationSeconds: poll.durationSeconds ?? null,
            duplicateVotePolicy: poll.duplicateVotePolicy,
            allowVoteChange: poll.allowVoteChange,
            state: "DRAFT",
            startsAt: null,
            endsAt: null,
            resultsPublished: false,
            createdByRole: "OWNER",
            createdByLabel: context.session.displayName ?? "Owner",
            options: {
              create: normalizedOptions
            }
          }
        });
      }
    });

    const polls = await listWorkspacePolls(context.workspace.id);
    return NextResponse.json({
      importedCount: payload.polls.length,
      polls
    });
  } catch (error) {
    return handleApiError(error);
  }
}

