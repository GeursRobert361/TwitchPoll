import Link from "next/link";
import { redirect } from "next/navigation";

import { DemoLoginButton } from "@/components/DemoLoginButton";
import { env } from "@/lib/env";
import { getServerWorkspaceContext } from "@/lib/serverSession";

export default async function HomePage(): Promise<React.ReactElement> {
  const context = await getServerWorkspaceContext();

  if (context) {
    redirect(context.isOwner ? "/dashboard" : "/mod");
  }

  return (
    <main className="grid" style={{ maxWidth: 920 }}>
      <section className="card" style={{ padding: "1.5rem" }}>
        <h1 style={{ marginTop: 0, fontSize: "2rem" }}>Twitch Poll Overlay</h1>
        <p className="muted" style={{ maxWidth: 700 }}>
          Build live polls from Twitch chat, show them as an OBS browser source, and manage them with owners
          and moderators.
        </p>

        <div className="row" style={{ marginTop: "1rem" }}>
          {env.demoMode ? (
            <DemoLoginButton />
          ) : (
            <Link href="/api/auth/twitch/start">
              <button type="button">Login with Twitch</button>
            </Link>
          )}
          <Link href="/mod/redeem">
            <button type="button" className="secondary">
              Redeem Mod Invite
            </button>
          </Link>
        </div>
      </section>

      <section className="grid two">
        <article className="card">
          <h2 className="section-title">Vote Input</h2>
          <p className="muted">Supports messages like `1`, `a`, `!vote 2`, or `!vote blue`.</p>
        </article>

        <article className="card">
          <h2 className="section-title">OBS Overlay</h2>
          <p className="muted">Every workspace gets a unique random overlay URL: `/o/&lt;overlayId&gt;`.</p>
        </article>
      </section>
    </main>
  );
}

