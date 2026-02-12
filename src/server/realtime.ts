import { getSocketServer, overlayRoom, workspaceRoom } from "@/lib/socketServer";
import { prisma } from "@/lib/prisma";
import type { PollRealtimePayload } from "@/types/poll";

const clampPercent = (value: number): number => Math.round(value * 10) / 10;

export const buildPollPayload = async (pollId: string): Promise<PollRealtimePayload | null> => {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      options: { orderBy: { position: "asc" } },
      workspace: {
        select: {
          id: true,
          overlaySlug: true
        }
      }
    }
  });

  if (!poll) {
    return null;
  }

  const grouped = await prisma.vote.groupBy({
    by: ["optionId"],
    where: { pollId: poll.id },
    _count: { _all: true }
  });

  const counts = new Map<string, number>();
  grouped.forEach((item) => counts.set(item.optionId, item._count._all));

  const totalVotes = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);

  const options = poll.options.map((option) => {
    const votes = counts.get(option.id) ?? 0;
    const percent = totalVotes > 0 ? clampPercent((votes / totalVotes) * 100) : 0;

    return {
      id: option.id,
      label: option.label,
      keyword: option.keyword,
      position: option.position,
      votes,
      percent
    };
  });

  const topOption = [...options].sort((a, b) => b.votes - a.votes)[0] ?? null;

  const recentVoters = await prisma.vote.findMany({
    where: { pollId: poll.id },
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: {
      voterUserName: true
    }
  });

  return {
    pollId: poll.id,
    workspaceId: poll.workspace.id,
    overlaySlug: poll.workspace.overlaySlug,
    title: poll.title,
    voteMode: poll.voteMode,
    state: poll.state,
    totalVotes,
    topOptionId: topOption?.id ?? null,
    startsAt: poll.startsAt ? poll.startsAt.toISOString() : null,
    endsAt: poll.endsAt ? poll.endsAt.toISOString() : null,
    resultsPublished: poll.resultsPublished,
    options,
    lastVoters: recentVoters.map((entry) => entry.voterUserName)
  };
};

export const buildActivePollPayloadByOverlay = async (
  overlayId: string
): Promise<PollRealtimePayload | null> => {
  const workspace = await prisma.channelWorkspace.findUnique({
    where: { overlaySlug: overlayId },
    select: {
      id: true
    }
  });

  if (!workspace) {
    return null;
  }

  const livePoll = await prisma.poll.findFirst({
    where: {
      workspaceId: workspace.id,
      state: "LIVE"
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    }
  });

  if (livePoll) {
    return buildPollPayload(livePoll.id);
  }

  const publishedEndedPoll = await prisma.poll.findFirst({
    where: {
      workspaceId: workspace.id,
      state: "ENDED",
      resultsPublished: true
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    }
  });

  if (!publishedEndedPoll) {
    return null;
  }

  return buildPollPayload(publishedEndedPoll.id);
};

export const broadcastPollUpdate = async (pollId: string): Promise<void> => {
  const payload = await buildPollPayload(pollId);
  if (!payload) {
    return;
  }

  const io = getSocketServer();
  if (!io) {
    return;
  }

  io.to(workspaceRoom(payload.workspaceId)).emit("poll:update", payload);
  io.to(overlayRoom(payload.overlaySlug)).emit("poll:update", payload);
};

export const broadcastPollState = async (pollId: string): Promise<void> => {
  const payload = await buildPollPayload(pollId);
  if (!payload) {
    return;
  }

  const io = getSocketServer();
  if (!io) {
    return;
  }

  const statePayload = {
    pollId: payload.pollId,
    state: payload.state,
    endsAt: payload.endsAt
  };

  io.to(workspaceRoom(payload.workspaceId)).emit("poll:state", statePayload);
  io.to(overlayRoom(payload.overlaySlug)).emit("poll:state", statePayload);
};

export const emitVoteReceived = (workspaceId: string, payload: Record<string, unknown>): void => {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  io.to(workspaceRoom(workspaceId)).emit("vote:received", payload);
};

