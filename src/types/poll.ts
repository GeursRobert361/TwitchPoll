export type PollOptionResult = {
  id: string;
  label: string;
  keyword: string;
  position: number;
  votes: number;
  percent: number;
};

export type PollRealtimePayload = {
  pollId: string;
  workspaceId: string;
  overlaySlug: string;
  title: string;
  voteMode: "NUMBERS" | "LETTERS" | "KEYWORDS";
  state: "DRAFT" | "LIVE" | "ENDED";
  totalVotes: number;
  topOptionId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  resultsPublished: boolean;
  options: PollOptionResult[];
  lastVoters: string[];
};

