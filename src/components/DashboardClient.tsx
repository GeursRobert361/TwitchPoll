"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

import type {
  InviteSummary,
  ModeratorSummary,
  PollOptionSummary,
  PollSummary,
  WorkspaceSummary
} from "@/types/dashboard";

type DashboardClientProps = {
  role: "OWNER" | "MOD";
  workspace: WorkspaceSummary;
  initialPolls: PollSummary[];
  initialModerators?: ModeratorSummary[];
  initialInvites?: InviteSummary[];
};

type OverlayTheme = "dark" | "light";

type VoteDebug = {
  pollId: string;
  voterUserName: string;
  optionPosition: number;
  source: string;
  receivedAt: string;
};

type PollEditorOption = {
  label: string;
  keyword: string;
};

type PollEditorDraft = {
  title: string;
  voteMode: PollSummary["voteMode"];
  durationSeconds: string;
  duplicateVotePolicy: PollSummary["duplicateVotePolicy"];
  allowVoteChange: boolean;
  options: PollEditorOption[];
};

const defaultKeywordForMode = (voteMode: PollSummary["voteMode"], index: number): string => {
  if (voteMode === "NUMBERS") {
    return String(index + 1);
  }

  if (voteMode === "LETTERS") {
    return String.fromCharCode(97 + index);
  }

  return `option_${index + 1}`;
};

const defaultOptionInputs = (
  count: number,
  voteMode: PollSummary["voteMode"] = "NUMBERS"
): Array<{ label: string; keyword: string }> =>
  Array.from({ length: count }, (_, index) => ({
    label: `Option ${index + 1}`,
    keyword: defaultKeywordForMode(voteMode, index)
  }));

const toLocalDateTime = (value: string | null): string => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
};

const statePillClass = (state: PollSummary["state"]): string => {
  if (state === "LIVE") {
    return "pill live";
  }

  if (state === "ENDED") {
    return "pill ended";
  }

  return "pill draft";
};

const topOptionLabel = (poll: PollSummary): string => {
  if (!poll.topOptionId) {
    return "None";
  }

  return poll.options.find((option) => option.id === poll.topOptionId)?.label ?? "None";
};

const sortOptions = (options: PollOptionSummary[]): PollOptionSummary[] =>
  [...options].sort((a, b) => a.position - b.position);

const clampPercentage = (value: number): number => Math.min(100, Math.max(0, Math.round(value)));
const MAX_POLL_DURATION_SECONDS = 15 * 60;

const getDurationSliderValue = (draft: string | undefined, fallback: number | null): number => {
  const parsed = Number((draft ?? "").trim());
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_POLL_DURATION_SECONDS) {
    return Math.round(parsed);
  }

  if (fallback !== null) {
    return Math.min(MAX_POLL_DURATION_SECONDS, Math.max(1, Math.round(fallback)));
  }

  return 120;
};

const formatRoundedHalfMinutes = (seconds: number): string => {
  const halfMinutes = Math.ceil(seconds / 30) / 2;
  const hasHalf = halfMinutes % 1 !== 0;

  return halfMinutes.toLocaleString(undefined, {
    minimumFractionDigits: hasHalf ? 1 : 0,
    maximumFractionDigits: 1
  });
};

const buildPollEditorDraft = (poll: PollSummary): PollEditorDraft => ({
  title: poll.title,
  voteMode: poll.voteMode,
  durationSeconds: poll.durationSeconds !== null ? String(poll.durationSeconds) : "",
  duplicateVotePolicy: poll.duplicateVotePolicy,
  allowVoteChange: poll.allowVoteChange,
  options: sortOptions(poll.options).map((option) => ({
    label: option.label,
    keyword: option.keyword
  }))
});

export function DashboardClient({
  role,
  workspace,
  initialPolls,
  initialModerators = [],
  initialInvites = []
}: DashboardClientProps): React.ReactElement {
  const [polls, setPolls] = useState<PollSummary[]>(initialPolls);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceSummary>(workspace);
  const [moderators, setModerators] = useState<ModeratorSummary[]>(initialModerators);
  const [invites, setInvites] = useState<InviteSummary[]>(initialInvites);
  const [latestInviteUrl, setLatestInviteUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState<"" | "export" | "import">("");
  const [actionBusyId, setActionBusyId] = useState<string>("");
  const [voteDebug, setVoteDebug] = useState<VoteDebug | null>(null);
  const [copiedKey, setCopiedKey] = useState<string>("");
  const [overlayUrlNeedsRecopy, setOverlayUrlNeedsRecopy] = useState(false);
  const [durationDraftByPoll, setDurationDraftByPoll] = useState<Record<string, string>>({});
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<PollEditorDraft | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newVoteMode, setNewVoteMode] = useState<PollSummary["voteMode"]>("NUMBERS");
  const [newDuration, setNewDuration] = useState<string>("120");
  const [newDuplicatePolicy, setNewDuplicatePolicy] = useState<PollSummary["duplicateVotePolicy"]>("LATEST");
  const [allowVoteChange, setAllowVoteChange] = useState(true);
  const [newOptions, setNewOptions] = useState<Array<{ label: string; keyword: string }>>(
    defaultOptionInputs(2, "NUMBERS")
  );

  const [botFilterEnabled, setBotFilterEnabled] = useState(workspace.botFilterEnabled);
  const [blacklistUsers, setBlacklistUsers] = useState(workspace.blacklistUsers.join(","));
  const [inviteExpiryDays, setInviteExpiryDays] = useState("7");
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>("dark");
  const [overlayHideVotes, setOverlayHideVotes] = useState(false);
  const [overlayAnimate, setOverlayAnimate] = useState(true);
  const [overlayShowTimer, setOverlayShowTimer] = useState(true);
  const [overlayShowLastVoters, setOverlayShowLastVoters] = useState(false);
  const [overlayShowNoPoll, setOverlayShowNoPoll] = useState(false);
  const [overlayShowModeHint, setOverlayShowModeHint] = useState(true);
  const [overlayNoPollText, setOverlayNoPollText] = useState("No active poll.");
  const [overlayBgTransparency, setOverlayBgTransparency] = useState(26);
  const hasInitializedOverlaySettings = useRef(false);
  const importBackupInputRef = useRef<HTMLInputElement | null>(null);

  const isOwner = role === "OWNER";

  const fetchPolls = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/polls");
    const payload = (await response.json()) as { polls: PollSummary[]; error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load polls");
    }

    setPolls(payload.polls);
  }, []);

  const fetchOwnerData = useCallback(async (): Promise<void> => {
    if (!isOwner) {
      return;
    }

    const response = await fetch("/api/mod-invites");
    const payload = (await response.json()) as {
      moderators?: ModeratorSummary[];
      invites?: InviteSummary[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load moderators/invites");
    }

    setModerators(payload.moderators ?? []);
    setInvites(payload.invites ?? []);
  }, [isOwner]);

  useEffect(() => {
    let active = true;

    const socket: Socket = io({ transports: ["websocket"] });

    socket.on("connect", () => {
      socket.emit("workspace:join", workspace.id);
    });

    socket.on("poll:update", () => {
      if (!active) {
        return;
      }

      fetchPolls().catch(() => undefined);
    });

    socket.on("poll:state", () => {
      if (!active) {
        return;
      }

      fetchPolls().catch(() => undefined);
    });

    socket.on("vote:received", (payload: VoteDebug) => {
      if (!active) {
        return;
      }

      setVoteDebug(payload);
    });

    return () => {
      active = false;
      socket.close();
    };
  }, [fetchPolls, workspace.id]);

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopiedKey("");
    }, 1300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copiedKey]);

  useEffect(() => {
    setDurationDraftByPoll((current) => {
      const next = { ...current };
      const pollIds = new Set(polls.map((poll) => poll.id));
      let changed = false;

      Object.keys(next).forEach((pollId) => {
        if (!pollIds.has(pollId)) {
          delete next[pollId];
          changed = true;
        }
      });

      polls.forEach((poll) => {
        if (next[poll.id] === undefined) {
          next[poll.id] = poll.durationSeconds !== null ? String(poll.durationSeconds) : "";
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [polls]);

  useEffect(() => {
    if (!editingPollId) {
      return;
    }

    const activePoll = polls.find((poll) => poll.id === editingPollId);
    if (!activePoll || activePoll.state !== "DRAFT") {
      setEditingPollId(null);
      setEditingDraft(null);
    }
  }, [polls, editingPollId]);

  useEffect(() => {
    if (!hasInitializedOverlaySettings.current) {
      hasInitializedOverlaySettings.current = true;
      return;
    }

    setOverlayUrlNeedsRecopy(true);
  }, [
    overlayTheme,
    overlayHideVotes,
    overlayAnimate,
    overlayShowTimer,
    overlayShowLastVoters,
    overlayShowNoPoll,
    overlayShowModeHint,
    overlayNoPollText,
    overlayBgTransparency
  ]);

  const livePoll = useMemo(() => polls.find((poll) => poll.state === "LIVE") ?? null, [polls]);

  const totalVotesAllPolls = useMemo(
    () => polls.reduce((sum, poll) => sum + poll.totalVotes, 0),
    [polls]
  );

  const overlayUrlWithOptions = useMemo(() => {
    const url = new URL(workspaceState.overlayUrl);
    const safeTransparency = clampPercentage(overlayBgTransparency);
    url.searchParams.set("theme", overlayTheme);
    url.searchParams.set("hideVotes", String(overlayHideVotes));
    url.searchParams.set("animate", String(overlayAnimate));
    url.searchParams.set("showTimer", String(overlayShowTimer));
    url.searchParams.set("showLastVoters", String(overlayShowLastVoters));
    url.searchParams.set("showNoPoll", String(overlayShowNoPoll));
    url.searchParams.set("showModeHint", String(overlayShowModeHint));
    url.searchParams.set("noPollText", overlayNoPollText.trim() || "No active poll.");
    url.searchParams.set("bgTransparency", String(safeTransparency));
    return url.toString();
  }, [
    workspaceState.overlayUrl,
    overlayTheme,
    overlayHideVotes,
    overlayAnimate,
    overlayShowTimer,
    overlayShowLastVoters,
    overlayShowNoPoll,
    overlayShowModeHint,
    overlayNoPollText,
    overlayBgTransparency
  ]);

  const safeOverlayBgTransparency = clampPercentage(overlayBgTransparency);

  const resetCreateForm = (): void => {
    setNewTitle("");
    setNewVoteMode("NUMBERS");
    setNewDuration("120");
    setNewDuplicatePolicy("LATEST");
    setAllowVoteChange(true);
    setNewOptions(defaultOptionInputs(2, "NUMBERS"));
  };

  const createPoll = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    setLoading(true);

    try {
      const duration = Number(newDuration);
      const hasDuration = newDuration.trim().length > 0;

      if (
        hasDuration
        && (!Number.isInteger(duration) || duration <= 0 || duration > MAX_POLL_DURATION_SECONDS)
      ) {
        alert(`Duration must be empty or a whole number between 1 and ${MAX_POLL_DURATION_SECONDS}`);
        return;
      }

      const response = await fetch("/api/polls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: newTitle,
          voteMode: newVoteMode,
          durationSeconds: hasDuration ? duration : null,
          duplicateVotePolicy: newDuplicatePolicy,
          allowVoteChange,
          options: newOptions
        })
      });

      const payload = (await response.json()) as { polls?: PollSummary[]; error?: string };
      if (!response.ok) {
        alert(payload.error ?? "Failed to create poll");
        return;
      }

      setPolls(payload.polls ?? []);
      resetCreateForm();
    } finally {
      setLoading(false);
    }
  };

  const runPollAction = async (
    pollId: string,
    action: "start" | "resume" | "stop" | "reset" | "publish",
    body?: Record<string, unknown>
  ): Promise<void> => {
    setActionBusyId(`${pollId}:${action}`);

    try {
      const response = await fetch(`/api/polls/${pollId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const payload = (await response.json()) as { polls?: PollSummary[]; error?: string };

      if (!response.ok) {
        alert(payload.error ?? `Failed action: ${action}`);
        return;
      }

      if (payload.polls) {
        setPolls(payload.polls);
      } else {
        await fetchPolls();
      }
    } finally {
      setActionBusyId("");
    }
  };

  const deletePoll = async (pollId: string): Promise<void> => {
    const shouldDelete = window.confirm("Delete this poll permanently?");
    if (!shouldDelete) {
      return;
    }

    setActionBusyId(`${pollId}:delete`);

    try {
      const response = await fetch(`/api/polls/${pollId}`, {
        method: "DELETE"
      });

      const payload = (await response.json()) as { polls?: PollSummary[]; error?: string };
      if (!response.ok) {
        alert(payload.error ?? "Failed to delete poll");
        return;
      }

      setPolls(payload.polls ?? []);
    } finally {
      setActionBusyId("");
    }
  };

  const savePollDuration = async (poll: PollSummary): Promise<void> => {
    const raw = (durationDraftByPoll[poll.id] ?? "").trim();

    if (raw.length > 0) {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_POLL_DURATION_SECONDS) {
        alert(`Duration must be empty or a whole number between 1 and ${MAX_POLL_DURATION_SECONDS}`);
        return;
      }
    }

    setActionBusyId(`${poll.id}:duration`);

    try {
      const durationSeconds = raw.length === 0 ? null : Number(raw);
      const response = await fetch(`/api/polls/${poll.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ durationSeconds })
      });

      const payload = (await response.json()) as { polls?: PollSummary[]; poll?: PollSummary | null; error?: string };
      if (!response.ok) {
        alert(payload.error ?? "Failed to update duration");
        return;
      }

      if (payload.polls) {
        setPolls(payload.polls);
      } else {
        await fetchPolls();
      }

      const updatedDuration = payload.poll?.durationSeconds ?? durationSeconds;
      setDurationDraftByPoll((current) => ({
        ...current,
        [poll.id]: updatedDuration !== null ? String(updatedDuration) : ""
      }));
    } finally {
      setActionBusyId("");
    }
  };

  const openPollEditor = (poll: PollSummary): void => {
    if (poll.state !== "DRAFT") {
      return;
    }

    setEditingPollId(poll.id);
    setEditingDraft(buildPollEditorDraft(poll));
  };

  const cancelPollEditor = (): void => {
    setEditingPollId(null);
    setEditingDraft(null);
  };

  const savePollEdits = async (poll: PollSummary): Promise<void> => {
    if (!editingDraft || editingPollId !== poll.id) {
      return;
    }

    if (editingDraft.title.trim().length < 3) {
      alert("Question must be at least 3 characters");
      return;
    }

    if (editingDraft.options.length < 2 || editingDraft.options.length > 8) {
      alert("Poll must have between 2 and 8 options");
      return;
    }

    if (editingDraft.options.some((option) => option.label.trim().length === 0)) {
      alert("Each option must have a label");
      return;
    }

    const durationRaw = editingDraft.durationSeconds.trim();
    let durationSeconds: number | null = null;
    if (durationRaw.length > 0) {
      const parsed = Number(durationRaw);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_POLL_DURATION_SECONDS) {
        alert(`Duration must be empty or a whole number between 1 and ${MAX_POLL_DURATION_SECONDS}`);
        return;
      }
      durationSeconds = parsed;
    }

    setActionBusyId(`${poll.id}:edit`);

    try {
      const response = await fetch(`/api/polls/${poll.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: editingDraft.title,
          voteMode: editingDraft.voteMode,
          durationSeconds,
          duplicateVotePolicy: editingDraft.duplicateVotePolicy,
          allowVoteChange: editingDraft.allowVoteChange,
          options: editingDraft.options
        })
      });

      const payload = (await response.json()) as { polls?: PollSummary[]; poll?: PollSummary | null; error?: string };
      if (!response.ok) {
        alert(payload.error ?? "Failed to edit poll");
        return;
      }

      if (payload.polls) {
        setPolls(payload.polls);
      } else {
        await fetchPolls();
      }

      const updatedDuration = payload.poll?.durationSeconds ?? durationSeconds;
      setDurationDraftByPoll((current) => ({
        ...current,
        [poll.id]: updatedDuration !== null ? String(updatedDuration) : ""
      }));

      setEditingPollId(null);
      setEditingDraft(null);
    } finally {
      setActionBusyId("");
    }
  };

  const saveWorkspaceSettings = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    setLoading(true);

    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          botFilterEnabled,
          blacklistUsers: blacklistUsers
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        })
      });

      const payload = (await response.json()) as { workspace?: WorkspaceSummary; error?: string };
      if (!response.ok) {
        alert(payload.error ?? "Failed to save workspace settings");
        return;
      }

      if (payload.workspace) {
        setWorkspaceState(payload.workspace);
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadPollBackup = async (): Promise<void> => {
    if (!isOwner) {
      return;
    }

    setBackupBusy("export");

    try {
      const response = await fetch("/api/polls/export");

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        alert(payload.error ?? "Failed to export polls");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename=\"?([^"]+)\"?/i);
      const fileName = fileNameMatch?.[1] ?? `polls-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setBackupBusy("");
    }
  };

  const triggerImportPollBackup = (): void => {
    importBackupInputRef.current?.click();
  };

  const importPollBackup = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setBackupBusy("import");

    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;

      const response = await fetch("/api/polls/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsed)
      });

      const payload = (await response.json()) as {
        importedCount?: number;
        polls?: PollSummary[];
        error?: string;
      };

      if (!response.ok) {
        alert(payload.error ?? "Failed to import polls");
        return;
      }

      if (payload.polls) {
        setPolls(payload.polls);
      } else {
        await fetchPolls();
      }

      alert(`Imported ${payload.importedCount ?? 0} poll(s).`);
    } catch {
      alert("Invalid backup file");
    } finally {
      setBackupBusy("");
    }
  };

  const createInvite = async (): Promise<void> => {
    const expiresInDays = Math.max(1, Number(inviteExpiryDays) || 7);

    setLoading(true);

    try {
      const response = await fetch("/api/mod-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expiresInDays })
      });

      const payload = (await response.json()) as {
        invite?: { url: string };
        error?: string;
      };

      if (!response.ok) {
        alert(payload.error ?? "Failed to create invite");
        return;
      }

      if (payload.invite?.url) {
        setLatestInviteUrl(payload.invite.url);
        await fetchOwnerData();
      }
    } finally {
      setLoading(false);
    }
  };

  const revokeInvite = async (inviteId: string): Promise<void> => {
    setActionBusyId(inviteId);

    try {
      const response = await fetch(`/api/mod-invites/${inviteId}/revoke`, {
        method: "POST"
      });

      if (!response.ok) {
        alert("Failed to revoke invite");
        return;
      }

      await fetchOwnerData();
    } finally {
      setActionBusyId("");
    }
  };

  const revokeModerator = async (modId: string): Promise<void> => {
    setActionBusyId(modId);

    try {
      const response = await fetch(`/api/mods/${modId}/revoke`, {
        method: "POST"
      });

      if (!response.ok) {
        alert("Failed to revoke moderator");
        return;
      }

      await fetchOwnerData();
    } finally {
      setActionBusyId("");
    }
  };

  const removeRevokedModerator = async (modId: string): Promise<void> => {
    setActionBusyId(`${modId}:delete`);

    try {
      const response = await fetch(`/api/mods/${modId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        alert("Failed to remove moderator");
        return;
      }

      await fetchOwnerData();
    } finally {
      setActionBusyId("");
    }
  };

  const copyToClipboard = async (value: string, key?: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      if (key) {
        setCopiedKey(key);
      }
      if (key === "configured-overlay-url") {
        setOverlayUrlNeedsRecopy(false);
      }
    } catch {
      // noop
    }
  };

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>{isOwner ? "Streamer Dashboard" : "Mod Dashboard"}</h1>
            <p className="muted" style={{ marginBottom: 0 }}>
              Channel: <span className="mono">#{workspaceState.channelLogin}</span>
            </p>
          </div>
          <span className="pill">{role}</span>
        </div>

        <div className="grid three" style={{ marginTop: "0.9rem" }}>
          <div className="card light">
            <div className="muted">Current poll</div>
            <div>{livePoll ? livePoll.title : "No live poll"}</div>
          </div>
          <div className="card light">
            <div className="muted">Total votes</div>
            <div>{totalVotesAllPolls}</div>
          </div>
          <div className="card light">
            <div className="muted">Top option (live)</div>
            <div>{livePoll ? topOptionLabel(livePoll) : "-"}</div>
          </div>
        </div>

        <details style={{ marginTop: "0.9rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Overlay behavior</summary>

          <div className="grid two" style={{ marginTop: "0.7rem" }}>
            <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={overlayShowTimer}
                onChange={(event) => setOverlayShowTimer(event.target.checked)}
                style={{ width: "auto" }}
              />
              Show timer
            </label>

            <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={overlayShowModeHint}
                onChange={(event) => setOverlayShowModeHint(event.target.checked)}
                style={{ width: "auto" }}
              />
              Show vote hint text
            </label>

            <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={overlayShowNoPoll}
                onChange={(event) => setOverlayShowNoPoll(event.target.checked)}
                style={{ width: "auto" }}
              />
              Show no-poll screen
            </label>

            <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={overlayShowLastVoters}
                onChange={(event) => setOverlayShowLastVoters(event.target.checked)}
                style={{ width: "auto" }}
              />
              Show last voters
            </label>
          </div>

          <label style={{ marginTop: "0.7rem" }}>
            No poll text
            <input
              value={overlayNoPollText}
              onChange={(event) => setOverlayNoPollText(event.target.value)}
              disabled={!overlayShowNoPoll}
            />
          </label>
        </details>

        <details style={{ marginTop: "0.7rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Overlay style</summary>

          <div className="grid two" style={{ marginTop: "0.7rem" }}>
            <label>
              Theme
              <select value={overlayTheme} onChange={(event) => setOverlayTheme(event.target.value as OverlayTheme)}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>

            <label>
              Background transparency: {safeOverlayBgTransparency}%
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={safeOverlayBgTransparency}
                onChange={(event) => setOverlayBgTransparency(clampPercentage(Number(event.target.value)))}
              />
            </label>

            <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={overlayHideVotes}
                onChange={(event) => setOverlayHideVotes(event.target.checked)}
                style={{ width: "auto" }}
              />
              Hide vote counts
            </label>

            <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
              <input
                type="checkbox"
                checked={overlayAnimate}
                onChange={(event) => setOverlayAnimate(event.target.checked)}
                style={{ width: "auto" }}
              />
              Animate bars
            </label>
          </div>
        </details>

        <div className="row" style={{ marginTop: "0.8rem" }}>
          <span className="mono">{overlayUrlWithOptions}</span>
          <button
            type="button"
            className={`secondary copy-feedback${copiedKey === "configured-overlay-url" ? " copied" : ""}`}
            onClick={() => copyToClipboard(overlayUrlWithOptions, "configured-overlay-url")}
          >
            {copiedKey === "configured-overlay-url" ? "Copied URL" : "Copy URL"}
          </button>
          <a href={overlayUrlWithOptions} target="_blank" rel="noreferrer">
            <button type="button" className="secondary">
              Open configured overlay
            </button>
          </a>
          <span className="help-tip" tabIndex={0} aria-label="How to add this URL in OBS">
            ?
            <span className="help-tip-content">
              In OBS, add a Browser source, paste this URL, set width and height, then click OK.
            </span>
          </span>
        </div>
        {overlayUrlNeedsRecopy ? (
          <div style={{ marginTop: "0.45rem", color: "var(--danger)", fontWeight: 600, fontSize: "0.86rem" }}>
            Overlay style/behavior changed. Copy URL again and update OBS.
          </div>
        ) : null}

        {voteDebug ? (
          <div className="muted" style={{ marginTop: "0.75rem" }}>
            Last vote: {voteDebug.voterUserName} to option {voteDebug.optionPosition} ({voteDebug.source})
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>Create Poll</h2>
          {isOwner ? (
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={downloadPollBackup}
                disabled={backupBusy === "export" || backupBusy === "import"}
              >
                {backupBusy === "export" ? "Downloading..." : "Download polls"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={triggerImportPollBackup}
                disabled={backupBusy === "export" || backupBusy === "import"}
              >
                {backupBusy === "import" ? "Importing..." : "Import polls"}
              </button>
            </div>
          ) : null}
        </div>

        {isOwner ? (
          <input
            ref={importBackupInputRef}
            type="file"
            accept="application/json,.json"
            onChange={importPollBackup}
            style={{ display: "none" }}
          />
        ) : null}

        <form onSubmit={createPoll} className="grid" style={{ gap: "0.7rem" }}>
          <label>
            Question
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              required
              placeholder="What should we play next?"
            />
          </label>

          <div className="grid three">
            <label>
              Vote mode
              <select
                value={newVoteMode}
                onChange={(event) => {
                  const mode = event.target.value as PollSummary["voteMode"];
                  setNewVoteMode(mode);
                  setNewOptions((current) =>
                    current.map((option, index) => ({
                      ...option,
                      keyword: defaultKeywordForMode(mode, index)
                    }))
                  );
                }}
              >
                <option value="NUMBERS">Numbers (1, 2 or !vote 2)</option>
                <option value="LETTERS">Letters (A, B or !vote B)</option>
                <option value="KEYWORDS">Keywords (keyword or !vote keyword)</option>
              </select>
            </label>

            <label>
              Duration (sec, optional)
              <input
                value={newDuration}
                onChange={(event) => setNewDuration(event.target.value)}
                type="number"
                min={0}
                max={MAX_POLL_DURATION_SECONDS}
              />
            </label>

            <label>
              Duplicate vote policy
              <select
                value={newDuplicatePolicy}
                onChange={(event) => setNewDuplicatePolicy(event.target.value as PollSummary["duplicateVotePolicy"])}
              >
                <option value="LATEST">Latest vote counts</option>
                <option value="FIRST">First vote counts</option>
              </select>
            </label>
          </div>

          <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
            <input
              type="checkbox"
              checked={allowVoteChange}
              onChange={(event) => setAllowVoteChange(event.target.checked)}
              style={{ width: "auto" }}
            />
            Allow changing vote
          </label>

          <div className="grid" style={{ gap: "0.5rem" }}>
            {newOptions.map((option, index) => (
              <div className="grid two" key={`option-${index}`}>
                <label>
                  Option {index + 1}
                  <input
                    value={option.label}
                    onChange={(event) => {
                      const copy = [...newOptions];
                      copy[index] = { ...copy[index], label: event.target.value };
                      setNewOptions(copy);
                    }}
                    required
                  />
                </label>
                <label>
                  Keyword
                  <input
                    value={option.keyword}
                    onChange={(event) => {
                      const copy = [...newOptions];
                      copy[index] = { ...copy[index], keyword: event.target.value };
                      setNewOptions(copy);
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="row">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (newOptions.length >= 8) {
                  return;
                }

                setNewOptions([
                  ...newOptions,
                  {
                    label: `Option ${newOptions.length + 1}`,
                    keyword: defaultKeywordForMode(newVoteMode, newOptions.length)
                  }
                ]);
              }}
              disabled={newOptions.length >= 8}
            >
              Add option
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (newOptions.length <= 2) {
                  return;
                }

                setNewOptions(newOptions.slice(0, -1));
              }}
              disabled={newOptions.length <= 2}
            >
              Remove option
            </button>
            <button type="submit" disabled={loading || newTitle.trim().length < 3}>
              {loading ? "Creating..." : "Create poll"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid" style={{ gap: "0.8rem" }}>
        {polls.map((poll) => (
          <article className="card" key={poll.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: "0.3rem" }}>{poll.title}</h3>
                <div className="row">
                  <span className={statePillClass(poll.state)}>{poll.state}</span>
                  <span className="pill">{poll.voteMode}</span>
                  <span className="pill">Votes: {poll.totalVotes}</span>
                </div>
              </div>

              <div className="row">
                {poll.state === "DRAFT" ? (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => openPollEditor(poll)}
                      disabled={actionBusyId === `${poll.id}:edit`}
                    >
                      {editingPollId === poll.id ? "Editing" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => runPollAction(poll.id, "start")}
                      disabled={actionBusyId === `${poll.id}:start`}
                    >
                      Start
                    </button>
                  </>
                ) : null}

                {poll.state === "ENDED" ? (
                  <button
                    type="button"
                    onClick={() => runPollAction(poll.id, "resume")}
                    disabled={actionBusyId === `${poll.id}:resume`}
                  >
                    Resume
                  </button>
                ) : null}

                {poll.state === "LIVE" ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => runPollAction(poll.id, "stop")}
                    disabled={actionBusyId === `${poll.id}:stop`}
                  >
                    Stop
                  </button>
                ) : null}

                <button
                  type="button"
                  className="secondary"
                  onClick={() => runPollAction(poll.id, "publish")}
                  disabled={actionBusyId === `${poll.id}:publish`}
                >
                  {poll.resultsPublished ? "Unpublish" : "Publish"}
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={() => runPollAction(poll.id, "reset")}
                  disabled={actionBusyId === `${poll.id}:reset`}
                >
                  Reset
                </button>

                {poll.state !== "LIVE" ? (
                  <button
                    type="button"
                    className="danger"
                    title="Delete poll"
                    onClick={() => deletePoll(poll.id)}
                    disabled={actionBusyId === `${poll.id}:delete`}
                    style={{ padding: "0.15rem 0.5rem", minWidth: 28, lineHeight: 1.1 }}
                  >
                    x
                  </button>
                ) : null}
              </div>
            </div>

            {editingPollId === poll.id && editingDraft ? (
              <div className="card" style={{ marginTop: "0.65rem" }}>
                <div className="grid" style={{ gap: "0.6rem" }}>
                  <label>
                    Question
                    <input
                      value={editingDraft.title}
                      onChange={(event) =>
                        setEditingDraft((current) =>
                          current
                            ? {
                                ...current,
                                title: event.target.value
                              }
                            : current
                        )
                      }
                    />
                  </label>

                  <div className="grid three">
                    <label>
                      Vote mode
                      <select
                        value={editingDraft.voteMode}
                        onChange={(event) => {
                          const mode = event.target.value as PollSummary["voteMode"];
                          setEditingDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  voteMode: mode,
                                  options: current.options.map((option, index) => ({
                                    ...option,
                                    keyword: defaultKeywordForMode(mode, index)
                                  }))
                                }
                              : current
                          );
                        }}
                      >
                        <option value="NUMBERS">Numbers (1, 2 or !vote 2)</option>
                        <option value="LETTERS">Letters (A, B or !vote B)</option>
                        <option value="KEYWORDS">Keywords (keyword or !vote keyword)</option>
                      </select>
                    </label>

                    <label>
                      Duration (sec, optional)
                      <input
                        type="number"
                        min={1}
                        max={MAX_POLL_DURATION_SECONDS}
                        value={editingDraft.durationSeconds}
                        onChange={(event) =>
                          setEditingDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  durationSeconds: event.target.value
                                }
                              : current
                          )
                        }
                      />
                    </label>

                    <label>
                      Duplicate vote policy
                      <select
                        value={editingDraft.duplicateVotePolicy}
                        onChange={(event) =>
                          setEditingDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  duplicateVotePolicy: event.target.value as PollSummary["duplicateVotePolicy"]
                                }
                              : current
                          )
                        }
                      >
                        <option value="LATEST">Latest vote counts</option>
                        <option value="FIRST">First vote counts</option>
                      </select>
                    </label>
                  </div>

                  <label className="row" style={{ alignItems: "center", gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      checked={editingDraft.allowVoteChange}
                      onChange={(event) =>
                        setEditingDraft((current) =>
                          current
                            ? {
                                ...current,
                                allowVoteChange: event.target.checked
                              }
                            : current
                        )
                      }
                      style={{ width: "auto" }}
                    />
                    Allow changing vote
                  </label>

                  <div className="grid" style={{ gap: "0.5rem" }}>
                    {editingDraft.options.map((option, index) => (
                      <div className="grid two" key={`${poll.id}-edit-option-${index}`}>
                        <label>
                          Option {index + 1}
                          <input
                            value={option.label}
                            onChange={(event) =>
                              setEditingDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      options: current.options.map((entry, idx) =>
                                        idx === index ? { ...entry, label: event.target.value } : entry
                                      )
                                    }
                                  : current
                              )
                            }
                          />
                        </label>
                        <label>
                          Keyword
                          <input
                            value={option.keyword}
                            onChange={(event) =>
                              setEditingDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      options: current.options.map((entry, idx) =>
                                        idx === index ? { ...entry, keyword: event.target.value } : entry
                                      )
                                    }
                                  : current
                              )
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="row">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setEditingDraft((current) => {
                          if (!current || current.options.length >= 8) {
                            return current;
                          }

                          return {
                            ...current,
                            options: [
                              ...current.options,
                              {
                                label: `Option ${current.options.length + 1}`,
                                keyword: defaultKeywordForMode(current.voteMode, current.options.length)
                              }
                            ]
                          };
                        })
                      }
                      disabled={editingDraft.options.length >= 8 || actionBusyId === `${poll.id}:edit`}
                    >
                      Add option
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setEditingDraft((current) => {
                          if (!current || current.options.length <= 2) {
                            return current;
                          }

                          return {
                            ...current,
                            options: current.options.slice(0, -1)
                          };
                        })
                      }
                      disabled={editingDraft.options.length <= 2 || actionBusyId === `${poll.id}:edit`}
                    >
                      Remove option
                    </button>
                    <button
                      type="button"
                      onClick={() => savePollEdits(poll)}
                      disabled={actionBusyId === `${poll.id}:edit`}
                    >
                      {actionBusyId === `${poll.id}:edit` ? "Saving..." : "Save edits"}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={cancelPollEditor}
                      disabled={actionBusyId === `${poll.id}:edit`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid two" style={{ marginTop: "0.5rem" }}>
              <div>
                {sortOptions(poll.options).map((option) => (
                  <div className="poll-option" key={option.id}>
                    <div className="meta">
                      <span>
                        {option.position}. {option.label}
                      </span>
                      <span>
                        {option.votes} ({option.percent}%)
                      </span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${option.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid" style={{ gap: "0.55rem" }}>
                <div className="card light">
                  <div className="kv">
                    <span>Top option</span>
                    <span>{topOptionLabel(poll)}</span>
                  </div>
                  <div className="kv">
                    <span>Starts</span>
                    <span>{toLocalDateTime(poll.startsAt)}</span>
                  </div>
                  <div className="kv">
                    <span>Ends</span>
                    <span>{toLocalDateTime(poll.endsAt)}</span>
                  </div>
                  <div className="kv">
                    <span>Vote policy</span>
                    <span>{poll.duplicateVotePolicy}</span>
                  </div>
                </div>

                <div
                  style={{
                    padding: "0.65rem 0.75rem",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.04)"
                  }}
                >
                  <label>
                    Duration: {getDurationSliderValue(durationDraftByPoll[poll.id], poll.durationSeconds)}s (
                    {formatRoundedHalfMinutes(
                      getDurationSliderValue(durationDraftByPoll[poll.id], poll.durationSeconds)
                    )}{" "}
                    min)
                    <input
                      type="range"
                      min={1}
                      max={MAX_POLL_DURATION_SECONDS}
                      step={5}
                      value={getDurationSliderValue(durationDraftByPoll[poll.id], poll.durationSeconds)}
                      onChange={(event) =>
                        setDurationDraftByPoll((current) => ({
                          ...current,
                          [poll.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                  <div className="row" style={{ marginTop: "0.45rem", justifyContent: "space-between" }}>
                    <span className="muted">1s</span>
                    <span className="muted">{MAX_POLL_DURATION_SECONDS}s</span>
                  </div>
                  <div className="row" style={{ marginTop: "0.45rem" }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => savePollDuration(poll)}
                      disabled={poll.state === "LIVE" || actionBusyId === `${poll.id}:duration`}
                    >
                      {actionBusyId === `${poll.id}:duration` ? "Saving..." : "Save duration"}
                    </button>
                    {poll.state === "LIVE" ? <span className="muted">Stop poll to edit duration</span> : null}
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      {isOwner ? (
        <section className="card">
          <h2 className="section-title">Workspace Settings</h2>

          <form onSubmit={saveWorkspaceSettings} className="grid" style={{ gap: "0.7rem" }}>
            <label className="row" style={{ alignItems: "center" }}>
              <input
                type="checkbox"
                checked={botFilterEnabled}
                onChange={(event) => setBotFilterEnabled(event.target.checked)}
                style={{ width: "auto" }}
              />
              Enable simple bot filter (`username` contains "bot")
            </label>

            <label>
              Blacklist usernames (comma-separated)
              <input
                value={blacklistUsers}
                onChange={(event) => setBlacklistUsers(event.target.value)}
                placeholder="nightbot,streamelements"
              />
            </label>

            <div className="row">
              <button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save workspace"}
              </button>
            </div>
          </form>

          <h3 className="section-title" style={{ marginTop: "1rem" }}>
            Moderator Invites
          </h3>

          <div className="row">
            <label style={{ width: 180 }}>
              Expires in days
              <input
                type="number"
                min={1}
                max={30}
                value={inviteExpiryDays}
                onChange={(event) => setInviteExpiryDays(event.target.value)}
              />
            </label>
            <button type="button" onClick={createInvite} disabled={loading}>
              Create invite
            </button>
          </div>

          {latestInviteUrl ? (
            <div className="row" style={{ marginTop: "0.65rem" }}>
              <span className="mono">{latestInviteUrl}</span>
              <button
                type="button"
                className={`secondary copy-feedback${copiedKey === "invite-url" ? " copied" : ""}`}
                onClick={() => copyToClipboard(latestInviteUrl, "invite-url")}
              >
                {copiedKey === "invite-url" ? "Copied URL" : "Copy invite URL"}
              </button>
            </div>
          ) : null}

          <div className="grid two" style={{ marginTop: "0.8rem" }}>
            <div>
              <h4 style={{ marginTop: 0 }}>Moderators</h4>
              {moderators.length === 0 ? <p className="muted">No moderators yet.</p> : null}
              {moderators.map((mod) => (
                <div className="card light" key={mod.id} style={{ marginBottom: "0.5rem", position: "relative" }}>
                  {mod.revokedAt ? (
                    <button
                      type="button"
                      className="danger"
                      title="Remove from list"
                      onClick={() => removeRevokedModerator(mod.id)}
                      disabled={actionBusyId === `${mod.id}:delete`}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        padding: "0.1rem 0.4rem",
                        minWidth: 24,
                        lineHeight: 1.1
                      }}
                    >
                      x
                    </button>
                  ) : null}
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div>
                      <div>{mod.displayName}</div>
                      <div className="muted">Last seen: {toLocalDateTime(mod.lastSeenAt)}</div>
                    </div>
                    {!mod.revokedAt ? (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => revokeModerator(mod.id)}
                        disabled={actionBusyId === mod.id}
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="pill ended">revoked</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h4 style={{ marginTop: 0 }}>Invite history</h4>
              {invites.length === 0 ? <p className="muted">No invites created yet.</p> : null}
              {invites.map((invite) => {
                const status = invite.revokedAt
                  ? "revoked"
                  : invite.usedAt
                    ? "used"
                    : new Date(invite.expiresAt).getTime() < Date.now()
                      ? "expired"
                      : "active";

                return (
                  <div className="card light" key={invite.id} style={{ marginBottom: "0.5rem" }}>
                    <div className="muted">Created: {toLocalDateTime(invite.createdAt)}</div>
                    <div className="muted">Expires: {toLocalDateTime(invite.expiresAt)}</div>
                    <div className="row" style={{ justifyContent: "space-between", marginTop: "0.3rem" }}>
                      <span className="pill">{status}</span>
                      {status === "active" ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => revokeInvite(invite.id)}
                          disabled={actionBusyId === invite.id}
                        >
                          Revoke
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

