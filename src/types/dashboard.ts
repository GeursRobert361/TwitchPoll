export type PollOptionSummary = {
  id: string;
  label: string;
  keyword: string;
  position: number;
  votes: number;
  percent: number;
};

export type PollSummary = {
  id: string;
  title: string;
  state: "DRAFT" | "LIVE" | "ENDED";
  voteMode: "NUMBERS" | "LETTERS" | "KEYWORDS";
  duplicateVotePolicy: "FIRST" | "LATEST";
  allowVoteChange: boolean;
  durationSeconds: number | null;
  startsAt: string | null;
  endsAt: string | null;
  resultsPublished: boolean;
  totalVotes: number;
  topOptionId: string | null;
  options: PollOptionSummary[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceSummary = {
  id: string;
  channelLogin: string;
  channelDisplayName: string;
  overlaySlug: string;
  overlayUrl: string;
  channelConfirmedAt: string | null;
  botFilterEnabled: boolean;
  blacklistUsers: string[];
};

export type ModeratorSummary = {
  id: string;
  displayName: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
};

export type InviteSummary = {
  id: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  moderator: {
    id: string;
    displayName: string;
  } | null;
};

