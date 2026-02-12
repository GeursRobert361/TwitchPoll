export type PollState = "DRAFT" | "LIVE" | "ENDED";
export type PollAction = "START" | "END" | "RESET";

export const canTransition = (state: PollState, action: PollAction): boolean => {
  if (action === "RESET") {
    return state === "LIVE" || state === "ENDED" || state === "DRAFT";
  }

  if (action === "START") {
    return state === "DRAFT";
  }

  return state === "LIVE";
};

export const transitionState = (state: PollState, action: PollAction): PollState => {
  if (!canTransition(state, action)) {
    throw new Error(`Invalid transition: ${state} -> ${action}`);
  }

  if (action === "START") {
    return "LIVE";
  }

  if (action === "END") {
    return "ENDED";
  }

  return "DRAFT";
};

