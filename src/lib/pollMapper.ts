import { Poll } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { PollSummary } from "@/types/dashboard";

const toPercent = (votes: number, total: number): number => {
  if (total === 0) {
    return 0;
  }

  return Math.round(((votes / total) * 100) * 10) / 10;
};

export const listWorkspacePolls = async (workspaceId: string): Promise<PollSummary[]> => {
  const polls = await prisma.poll.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      options: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          label: true,
          keyword: true,
          position: true
        }
      },
      votes: {
        select: {
          optionId: true
        }
      }
    }
  });

  return polls.map((poll) => {
    const counts = new Map<string, number>();

    poll.votes.forEach((vote) => {
      const current = counts.get(vote.optionId) ?? 0;
      counts.set(vote.optionId, current + 1);
    });

    const totalVotes = poll.votes.length;

    const options = poll.options.map((option) => {
      const votes = counts.get(option.id) ?? 0;

      return {
        ...option,
        votes,
        percent: toPercent(votes, totalVotes)
      };
    });

    const topOption = [...options].sort((a, b) => b.votes - a.votes)[0] ?? null;

    return {
      id: poll.id,
      title: poll.title,
      state: poll.state,
      voteMode: poll.voteMode,
      duplicateVotePolicy: poll.duplicateVotePolicy,
      allowVoteChange: poll.allowVoteChange,
      durationSeconds: poll.durationSeconds,
      startsAt: poll.startsAt ? poll.startsAt.toISOString() : null,
      endsAt: poll.endsAt ? poll.endsAt.toISOString() : null,
      resultsPublished: poll.resultsPublished,
      totalVotes,
      topOptionId: topOption?.id ?? null,
      options,
      createdAt: poll.createdAt.toISOString(),
      updatedAt: poll.updatedAt.toISOString()
    };
  });
};

export type { PollSummary };

