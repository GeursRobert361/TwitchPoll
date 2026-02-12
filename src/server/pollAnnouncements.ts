import { VoteMode } from "@prisma/client";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { twitchBotClient } from "@/server/twitchBotClient";

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 3)}...`;
};

const canAnnounce = (): boolean => {
  if (env.demoMode) {
    return false;
  }

  return env.twitchBotEnabled && !!env.twitchBotUsername && !!env.twitchBotOauthToken;
};

const toVoteToken = (voteMode: VoteMode, position: number, keyword: string): string => {
  if (voteMode === VoteMode.NUMBERS) {
    return String(position);
  }

  if (voteMode === VoteMode.LETTERS) {
    return String.fromCharCode(64 + position);
  }

  return keyword;
};

const buildVoteHint = (
  voteMode: VoteMode,
  options: Array<{ position: number; keyword: string }>
): string => {
  const tokens = options
    .map((option) => toVoteToken(voteMode, option.position, option.keyword))
    .filter(Boolean)
    .slice(0, 8);

  if (tokens.length === 0) {
    return "Vote in chat now.";
  }

  const joined = tokens.join("/");

  if (voteMode === VoteMode.KEYWORDS) {
    return `Vote with !vote <keyword> (${joined}).`;
  }

  return `Vote with ${joined}.`;
};

const announce = (channelLogin: string, message: string): void => {
  if (!canAnnounce()) {
    return;
  }

  twitchBotClient.sendMessage(channelLogin, message);
};

export const announcePollStarted = async (pollId: string, channelLogin: string): Promise<void> => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      select: {
        title: true,
        voteMode: true,
        options: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            keyword: true
          }
        }
      }
    });

    if (!poll) {
      return;
    }

    const message = `Poll started: ${truncate(poll.title, 120)} | ${buildVoteHint(poll.voteMode, poll.options)}`;
    announce(channelLogin, message);
  } catch (error) {
    logger.warn("Failed to send poll start announcement", { error, pollId, channelLogin });
  }
};

export const announcePollEnded = async (pollId: string, channelLogin: string): Promise<void> => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      select: {
        title: true,
        options: {
          orderBy: { position: "asc" },
          select: {
            label: true,
            _count: {
              select: {
                votes: true
              }
            }
          }
        }
      }
    });

    if (!poll) {
      return;
    }

    const totalVotes = poll.options.reduce((sum, option) => sum + option._count.votes, 0);
    const winner = [...poll.options].sort((a, b) => b._count.votes - a._count.votes)[0] ?? null;

    if (!winner || totalVotes === 0) {
      announce(channelLogin, `Poll ended: ${truncate(poll.title, 120)} | No votes this round.`);
      return;
    }

    announce(
      channelLogin,
      `Poll ended: ${truncate(poll.title, 120)} | Winner: ${truncate(winner.label, 60)} (${winner._count.votes}/${totalVotes} votes).`
    );
  } catch (error) {
    logger.warn("Failed to send poll end announcement", { error, pollId, channelLogin });
  }
};
