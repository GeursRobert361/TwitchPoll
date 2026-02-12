"use client";

import { useState } from "react";

type Props = {
  initialToken: string;
};

export function ModRedeemForm({ initialToken }: Props): React.ReactElement {
  const [token, setToken] = useState(initialToken);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await fetch("/api/mod-invites/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token,
          displayName
        })
      });

      const payload = (await response.json()) as { redirectTo?: string; error?: string };

      if (!response.ok) {
        alert(payload.error ?? "Could not redeem invite");
        return;
      }

      window.location.href = payload.redirectTo ?? "/mod";
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid" style={{ gap: "0.8rem" }}>
      <label>
        Invite token
        <input value={token} onChange={(event) => setToken(event.target.value)} required />
      </label>

      <label>
        Display name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Mod Name"
          required
        />
      </label>

      <button type="submit" disabled={busy}>
        {busy ? "Redeeming..." : "Redeem invite"}
      </button>
    </form>
  );
}

