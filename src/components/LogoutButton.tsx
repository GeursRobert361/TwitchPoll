"use client";

import { useState } from "react";

export function LogoutButton(): React.ReactElement {
  const [busy, setBusy] = useState(false);

  const onLogout = async (): Promise<void> => {
    setBusy(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST"
      });
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="secondary" onClick={onLogout} disabled={busy}>
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}

