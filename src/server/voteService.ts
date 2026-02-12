import { DuplicateVotePolicy, PollState, VoteMode } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseVoteMessage } from "@/lib/voteParser";
import { broadcastPollUpdate, emitVoteReceived } from "@/server/realtime";

type IngestVoteInput = {
  channel: string;
  username: string;
  message: string;
  source: "twitch" | "demo";
};

const voteThrottleMs = 1000;
const recentVotes = new Map<string, number>();

const normalize = (value: string): string => value.trim().toLowerCase();

const isThrottled = (pollId: string, username: string): boolean => {
  const key = `${pollId}:${username}`;
  const now = Date.now();
  const lastSeen = recentVotes.get(key) ?? 0;

  if (now - lastSeen < voteThrottleMs) {
    return true;
  }

  recentVotes.set(key, now);
  return false;
};

const isBlockedUser = (username: string, botFilterEnabled: boolean, blacklistJson: string | null): boolean => {
  const normalized = normalize(username);

  if (botFilterEnabled && normalized.includes("bot")) {
    return true;
  }

  if (!blacklistJson) {
    return false;
  }

  try {
    const list = JSON.parse(blacklistJson) as string[];
    return list.map((entry) => normalize(entry)).includes(normalized);
  } catch {
    return false;
  }
};

const duplicatePolicyBlocks = (
  policy: DuplicateVotePolicy,
  allowVoteChange: boolean,
  hasExistingVote: boolean
): boolean => {
  if (!hasExistingVote) {
    return false;
  }

  if (!allowVoteChange) {
    return true;
  }

  return policy === "FIRST";
};

export const ingestVote = async ({ channel, username, message, source }: IngestVoteInput): Promise<void> => {
  const channelLogin = normalize(channel);
  const voterUserName = normalize(username);

  if (!channelLogin || !voterUserName) {
    return;
  }

  const workspace = await prisma.channelWorkspace.findFirst({
    where: { channelLogin },
    select: {
      id: true,
      botFilterEnabled: true,
      blacklistJson: true,
      polls: {
        where: { state: PollState.LIVE },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          title: true,
          voteMode: true,
          duplicateVotePolicy: true,
          allowVoteChange: true,
          options: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              position: true,
              keyword: true,
              label: true
            }
          }
        }
      }
    }
  });

  const poll = workspace?.polls[0];
  if (!workspace || !poll) {
    return;
  }

  if (isBlockedUser(voterUserName, workspace.botFilterEnabled, workspace.blacklistJson)) {
    return;
  }

  if (isThrottled(poll.id, voterUserName)) {
    return;
  }

  const parsedOption = parseVoteMessage({
    mode: poll.voteMode as VoteMode,
    options: poll.options,
    message
  });

  if (!parsedOption) {
    return;
  }

  const existingVote = await prisma.vote.findUnique({
    where: {
      pollId_voterUserName: {
        pollId: poll.id,
        voterUserName
      }
    },
    select: {
      id: true,
      optionId: true
    }
  });

  if (duplicatePolicyBlocks(poll.duplicateVotePolicy, poll.allowVoteChange, Boolean(existingVote))) {
    return;
  }

  if (existingVote && existingVote.optionId === parsedOption.id) {
    return;
  }

  if (existingVote) {
    await prisma.vote.update({
      where: { id: existingVote.id },
      data: {
        optionId: parsedOption.id,
        updatedAt: new Date()
      }
    });
  } else {
    await prisma.vote.create({
      data: {
        pollId: poll.id,
        optionId: parsedOption.id,
        voterUserName
      }
    });
  }

  emitVoteReceived(workspace.id, {
    pollId: poll.id,
    title: poll.title,
    source,
    voterUserName,
    optionId: parsedOption.id,
    optionPosition: parsedOption.position,
    message,
    receivedAt: new Date().toISOString()
  });

  await broadcastPollUpdate(poll.id);
};

export const clearVoteThrottleCache = (): void => {
  recentVotes.clear();
};

export const submitDemoVote = async (
  workspaceChannel: string,
  username: string,
  message: string
): Promise<void> => {
  try {
    await ingestVote({
      channel: workspaceChannel,
      username,
      message,
      source: "demo"
    });
  } catch (error) {
    logger.error("Failed to process demo vote", { error, workspaceChannel, username, message });
  }
};

