import { PollState, VoteMode } from "@prisma/client";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { broadcastPollState, broadcastPollUpdate } from "@/server/realtime";
import { twitchIrcClient } from "@/server/twitchIrcClient";
import { ingestVote, submitDemoVote } from "@/server/voteService";

const joinedChannels = new Set<string>();
let lifecycleInterval: NodeJS.Timeout | null = null;
let channelSyncInterval: NodeJS.Timeout | null = null;
let demoFeedInterval: NodeJS.Timeout | null = null;
let unsubIrc: (() => void) | null = null;

const normalize = (value: string): string => value.trim().toLowerCase();

const endExpiredPolls = async (): Promise<void> => {
  const now = new Date();

  const expiredPolls = await prisma.poll.findMany({
    where: {
      state: PollState.LIVE,
      endsAt: {
        lte: now
      }
    },
    select: {
      id: true
    }
  });

  for (const poll of expiredPolls) {
    await prisma.poll.update({
      where: { id: poll.id },
      data: {
        state: PollState.ENDED,
        updatedAt: new Date()
      }
    });

    await broadcastPollState(poll.id);
    await broadcastPollUpdate(poll.id);
  }
};

const syncChannels = async (): Promise<void> => {
  const activeWorkspaces = await prisma.channelWorkspace.findMany({
    where: {
      polls: {
        some: {
          state: PollState.LIVE
        }
      }
    },
    select: {
      channelLogin: true
    }
  });

  const shouldBeJoined = new Set(activeWorkspaces.map((entry) => normalize(entry.channelLogin)).filter(Boolean));

  shouldBeJoined.forEach((channel) => {
    if (!joinedChannels.has(channel)) {
      joinedChannels.add(channel);
      twitchIrcClient.joinChannel(channel);
      logger.info("Joined Twitch channel for live polling", { channel });
    }
  });

  for (const channel of [...joinedChannels]) {
    if (!shouldBeJoined.has(channel)) {
      joinedChannels.delete(channel);
      twitchIrcClient.leaveChannel(channel);
      logger.info("Left Twitch channel because no live poll is active", { channel });
    }
  }
};

const randomPick = <T>(items: T[]): T | null => {
  if (items.length === 0) {
    return null;
  }

  return items[Math.floor(Math.random() * items.length)] ?? null;
};

const buildDemoVoteMessage = (
  voteMode: VoteMode,
  optionCount: number,
  keywords: string[]
): string | null => {
  if (optionCount === 0) {
    return null;
  }

  if (voteMode === "NUMBERS") {
    const choice = Math.floor(Math.random() * optionCount) + 1;
    return Math.random() > 0.5 ? String(choice) : `!vote ${choice}`;
  }

  if (voteMode === "LETTERS") {
    const index = Math.floor(Math.random() * optionCount);
    const letter = String.fromCharCode(97 + index);
    return Math.random() > 0.5 ? letter : `!vote ${letter}`;
  }

  const keyword = randomPick(keywords);
  if (!keyword) {
    return null;
  }

  return Math.random() > 0.5 ? keyword : `!vote ${keyword}`;
};

const demoUsers = [
  "alpha_viewer",
  "beta_viewer",
  "gamma_chat",
  "delta_player",
  "omega_listener",
  "pixel_lurker",
  "chatfan101"
];

const runDemoFeedTick = async (): Promise<void> => {
  const livePolls = await prisma.poll.findMany({
    where: {
      state: PollState.LIVE
    },
    include: {
      workspace: {
        select: {
          channelLogin: true
        }
      },
      options: {
        orderBy: { position: "asc" },
        select: {
          keyword: true
        }
      }
    }
  });

  for (const poll of livePolls) {
    const username = randomPick(demoUsers);
    if (!username) {
      continue;
    }

    const message = buildDemoVoteMessage(
      poll.voteMode,
      poll.options.length,
      poll.options.map((option) => option.keyword)
    );

    if (!message) {
      continue;
    }

    await submitDemoVote(poll.workspace.channelLogin, username, message);
  }
};

export const startRuntime = (): void => {
  logger.info("Starting runtime services", { demoMode: env.demoMode });

  twitchIrcClient.start();

  unsubIrc = twitchIrcClient.onMessage(async (message) => {
    try {
      await ingestVote({
        channel: message.channel,
        username: message.username,
        message: message.message,
        source: "twitch"
      });
    } catch (error) {
      logger.error("Failed to process Twitch chat vote", {
        error,
        channel: message.channel,
        username: message.username
      });
    }
  });

  lifecycleInterval = setInterval(() => {
    endExpiredPolls().catch((error) => logger.error("Lifecycle tick failed", { error }));
  }, 1000);

  channelSyncInterval = setInterval(() => {
    syncChannels().catch((error) => logger.error("Channel sync tick failed", { error }));
  }, 4000);

  if (env.demoMode) {
    demoFeedInterval = setInterval(() => {
      runDemoFeedTick().catch((error) => logger.error("Demo feed tick failed", { error }));
    }, 2500);
  }
};

export const stopRuntime = (): void => {
  lifecycleInterval && clearInterval(lifecycleInterval);
  channelSyncInterval && clearInterval(channelSyncInterval);
  demoFeedInterval && clearInterval(demoFeedInterval);

  lifecycleInterval = null;
  channelSyncInterval = null;
  demoFeedInterval = null;

  joinedChannels.clear();

  unsubIrc?.();
  unsubIrc = null;

  twitchIrcClient.stop();
};

