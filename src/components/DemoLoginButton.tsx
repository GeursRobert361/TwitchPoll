"use client";

import { useState } from "react";

export function DemoLoginButton(): React.ReactElement {
  const [loading, setLoading] = useState(false);

  const onClick = async (): Promise<void> => {
    setLoading(true);

    try {
      const response = await fetch("/api/auth/demo-login", {
        method: "POST"
      });

      const payload = (await response.json()) as { redirectTo?: string; error?: string };

      if (!response.ok) {
        alert(payload.error ?? "Demo login failed");
        return;
      }

      window.location.href = payload.redirectTo ?? "/dashboard";
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" className="secondary" onClick={onClick} disabled={loading}>
      {loading ? "Preparing demo..." : "Enter Demo Mode"}
    </button>
  );
}

