"use client";

import { useState } from "react";

type Props = {
  channelLogin: string;
  channelDisplayName: string;
};

export function OnboardingForm({ channelLogin, channelDisplayName }: Props): React.ReactElement {
  const [login, setLogin] = useState(channelLogin);
  const [displayName, setDisplayName] = useState(channelDisplayName);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          channelLogin: login,
          channelDisplayName: displayName,
          confirmChannel: true
        })
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        alert(payload.error ?? "Failed to confirm channel");
        return;
      }

      window.location.href = "/dashboard";
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid" style={{ gap: "0.9rem" }}>
      <label>
        Channel login
        <input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="your_channel" required />
      </label>

      <label>
        Channel display name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Your Channel"
          required
        />
      </label>

      <button type="submit" disabled={saving}>
        {saving ? "Saving..." : "Confirm channel"}
      </button>
    </form>
  );
}

