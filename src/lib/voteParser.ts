export type VoteMode = "NUMBERS" | "LETTERS" | "KEYWORDS";

export type VoteOptionInput = {
  id: string;
  position: number;
  keyword: string;
  label: string;
};

type ParseVoteInput = {
  mode: VoteMode;
  options: VoteOptionInput[];
  message: string;
};

export const normalizeVoteMessage = (message: string): string => message.trim().toLowerCase();

const stripVoteCommand = (normalizedMessage: string): string => {
  if (normalizedMessage.startsWith("!vote")) {
    return normalizedMessage.slice(5).trim();
  }

  return normalizedMessage;
};

export const parseVoteMessage = ({ mode, options, message }: ParseVoteInput): VoteOptionInput | null => {
  const normalized = normalizeVoteMessage(message);
  if (!normalized) {
    return null;
  }

  const candidate = stripVoteCommand(normalized);
  if (!candidate) {
    return null;
  }

  if (mode === "NUMBERS") {
    if (!/^\d+$/.test(candidate)) {
      return null;
    }

    const value = Number(candidate);
    if (value < 1 || value > options.length) {
      return null;
    }

    return options[value - 1] ?? null;
  }

  if (mode === "LETTERS") {
    if (!/^[a-z]$/.test(candidate)) {
      return null;
    }

    const value = candidate.charCodeAt(0) - 97;
    if (value < 0 || value >= options.length) {
      return null;
    }

    return options[value] ?? null;
  }

  return (
    options.find((option) => {
      const keyword = option.keyword.trim().toLowerCase();
      const label = option.label.trim().toLowerCase();
      return candidate === keyword || candidate === label;
    }) ?? null
  );
};

