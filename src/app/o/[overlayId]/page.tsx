import { OverlayClient } from "@/components/OverlayClient";
import { buildActivePollPayloadByOverlay } from "@/server/realtime";

type Props = {
  params: {
    overlayId: string;
  };
  searchParams?: {
    theme?: string;
    hideVotes?: string;
    animate?: string;
    showTimer?: string;
    showLastVoters?: string;
    showNoPoll?: string;
    showModeHint?: string;
    noPollText?: string;
    bgTransparency?: string;
  };
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === "true";
};

const parsePercentage = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
};

export default async function OverlayPage({ params, searchParams }: Props): Promise<React.ReactElement> {
  const poll = await buildActivePollPayloadByOverlay(params.overlayId);

  const theme = searchParams?.theme === "light" ? "light" : "dark";
  const hideVotes = parseBoolean(searchParams?.hideVotes, false);
  const animate = parseBoolean(searchParams?.animate, true);
  const showTimer = parseBoolean(searchParams?.showTimer, true);
  const showLastVoters = parseBoolean(searchParams?.showLastVoters, true);
  const showNoPoll = parseBoolean(searchParams?.showNoPoll, true);
  const showModeHint = parseBoolean(searchParams?.showModeHint, true);
  const noPollText = searchParams?.noPollText?.trim() || "No active poll.";
  const bgTransparency = parsePercentage(searchParams?.bgTransparency, 26);

  return (
    <OverlayClient
      overlayId={params.overlayId}
      initialPoll={poll}
      theme={theme}
      hideVotes={hideVotes}
      animate={animate}
      showTimer={showTimer}
      showLastVoters={showLastVoters}
      showNoPoll={showNoPoll}
      showModeHint={showModeHint}
      noPollText={noPollText}
      backgroundTransparency={bgTransparency}
    />
  );
}

