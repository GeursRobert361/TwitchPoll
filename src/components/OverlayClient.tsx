"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type { PollRealtimePayload } from "@/types/poll";

type OverlayClientProps = {
  overlayId: string;
  initialPoll: PollRealtimePayload | null;
  theme: "dark" | "light";
  hideVotes: boolean;
  animate: boolean;
  showTimer: boolean;
  showLastVoters: boolean;
  showNoPoll: boolean;
  showModeHint: boolean;
  noPollText: string;
  backgroundTransparency: number;
};

type OverlayApiResponse = {
  poll: PollRealtimePayload | null;
};

type PollStateEvent = {
  pollId: string;
  state: PollRealtimePayload["state"];
  endsAt: string | null;
};

const getRemainingSeconds = (endsAt: string | null): number | null => {
  if (!endsAt) {
    return null;
  }

  return Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
};

const fetchOverlayPoll = async (overlayId: string): Promise<PollRealtimePayload | null> => {
  const response = await fetch(`/api/overlay/${encodeURIComponent(overlayId)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as OverlayApiResponse;
  return payload.poll ?? null;
};

export function OverlayClient({
  overlayId,
  initialPoll,
  theme,
  hideVotes,
  animate,
  showTimer,
  showLastVoters,
  showNoPoll,
  showModeHint,
  noPollText,
  backgroundTransparency
}: OverlayClientProps): React.ReactElement {
  const [poll, setPoll] = useState<PollRealtimePayload | null>(initialPoll);
  const [remaining, setRemaining] = useState<number | null>(() => getRemainingSeconds(initialPoll?.endsAt ?? null));
  const panelAlpha = Math.max(0, Math.min(1, 1 - backgroundTransparency / 100));
  const panelBackground =
    theme === "dark" ? `rgba(6, 12, 20, ${panelAlpha})` : `rgba(255, 255, 255, ${panelAlpha})`;
  const noPollBackground =
    theme === "dark" ? `rgba(10, 18, 32, ${panelAlpha})` : `rgba(250, 252, 255, ${panelAlpha})`;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlBackground: html.style.background,
      htmlBackgroundImage: html.style.backgroundImage,
      bodyBackground: body.style.background,
      bodyBackgroundImage: body.style.backgroundImage
    };

    html.style.background = "transparent";
    html.style.backgroundImage = "none";
    body.style.background = "transparent";
    body.style.backgroundImage = "none";

    return () => {
      html.style.background = previous.htmlBackground;
      html.style.backgroundImage = previous.htmlBackgroundImage;
      body.style.background = previous.bodyBackground;
      body.style.backgroundImage = previous.bodyBackgroundImage;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const refreshPoll = async (): Promise<void> => {
      const latestPoll = await fetchOverlayPoll(overlayId);
      if (!active) {
        return;
      }

      setPoll(latestPoll);
      setRemaining(getRemainingSeconds(latestPoll?.endsAt ?? null));
    };

    const socket: Socket = io({ transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      socket.emit("overlay:join", overlayId);
      refreshPoll().catch(() => undefined);
    });

    socket.on("poll:update", (payload: PollRealtimePayload) => {
      setPoll(payload);
      setRemaining(getRemainingSeconds(payload.endsAt));
    });

    socket.on("poll:state", (payload: PollStateEvent) => {
      setPoll((current) =>
        current && current.pollId === payload.pollId
          ? {
              ...current,
              state: payload.state,
              endsAt: payload.endsAt
            }
          : current
      );
      setRemaining(getRemainingSeconds(payload.endsAt));
      refreshPoll().catch(() => undefined);
    });

    refreshPoll().catch(() => undefined);

    const refreshInterval = setInterval(() => {
      refreshPoll().catch(() => undefined);
    }, 3000);

    return () => {
      active = false;
      clearInterval(refreshInterval);
      socket.close();
    };
  }, [overlayId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(getRemainingSeconds(poll?.endsAt ?? null));
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [poll?.endsAt]);

  const modeHint = useMemo(() => {
    if (!poll) {
      return "";
    }

    if (poll.voteMode === "NUMBERS") {
      return "1, 2 or !vote 2";
    }

    if (poll.voteMode === "LETTERS") {
      return "A, B or !vote B";
    }

    return "keyword or !vote keyword";
  }, [poll]);

  if (!poll) {
    if (!showNoPoll) {
      return (
        <div
          style={{
            width: "100vw",
            height: "100vh",
            background: "transparent"
          }}
        />
      );
    }

    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-heading)",
          color: theme === "dark" ? "#f8fdff" : "#0f2433",
          background: "transparent"
        }}
      >
        <div
          style={{
            borderRadius: 16,
            padding: "1.2rem 1.6rem",
            background: noPollBackground,
            border: "1px solid rgba(255,255,255,0.22)"
          }}
        >
          {noPollText}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        padding: "3vw",
        fontFamily: "var(--font-heading)",
        color: theme === "dark" ? "#f9fdff" : "#112739",
        background: "transparent"
      }}
    >
      <section
        style={{
          maxWidth: 960,
          background: panelBackground,
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.35)",
          padding: "2rem"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <div>
            <div
              style={{
                display: "inline-flex",
                padding: "0.3rem 0.55rem",
                borderRadius: 999,
                background: poll.state === "LIVE" ? "rgba(30,211,167,0.3)" : "rgba(255,140,66,0.3)",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.08em"
              }}
            >
              {poll.state}
            </div>
            <h1 style={{ marginTop: "0.8rem", marginBottom: "0.35rem", fontSize: "2.1rem" }}>{poll.title}</h1>
            {showModeHint ? (
              <div
                style={{
                  marginTop: "0.3rem",
                  display: "inline-flex",
                  borderRadius: 999,
                  padding: "0.3rem 0.55rem",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.85rem",
                  letterSpacing: "0.01em",
                  opacity: 0.9,
                  background: theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(16,39,57,0.12)"
                }}
              >
                {modeHint}
              </div>
            ) : null}
          </div>

          {showTimer && remaining !== null ? (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "2rem",
                padding: "0.5rem 0.7rem",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.12)"
              }}
            >
              {remaining}s
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}>
          {[...poll.options]
            .sort((a, b) => a.position - b.position)
            .map((option) => (
              <div key={option.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "1.1rem",
                    marginBottom: 6
                  }}
                >
                  <span>
                    {option.position}. {option.label}
                  </span>
                  {!hideVotes ? <span>{option.votes} ({option.percent}%)</span> : null}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 16,
                    borderRadius: 999,
                    background: theme === "dark" ? "rgba(255,255,255,0.14)" : "rgba(16,39,57,0.1)",
                    overflow: "hidden"
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${option.percent}%`,
                      transition: animate ? "width 280ms ease" : "none",
                      background: "rgba(30,211,167,0.95)"
                    }}
                  />
                </div>
              </div>
            ))}
        </div>

        {showLastVoters && poll.lastVoters.length > 0 ? (
          <div style={{ marginTop: "1rem", opacity: 0.85, fontSize: "0.9rem" }}>
            Last voters: {poll.lastVoters.join(", ")}
          </div>
        ) : null}
      </section>
    </div>
  );
}

