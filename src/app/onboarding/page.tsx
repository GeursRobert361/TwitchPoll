import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/OnboardingForm";
import { getServerWorkspaceContext } from "@/lib/serverSession";

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const context = await getServerWorkspaceContext();

  if (!context || !context.isOwner) {
    redirect("/");
  }

  if (context.workspace.channelConfirmedAt) {
    redirect("/dashboard");
  }

  return (
    <main style={{ maxWidth: 640 }}>
      <section className="card" style={{ padding: "1.4rem" }}>
        <h1 style={{ marginTop: 0 }}>Confirm your poll channel</h1>
        <p className="muted">
          Poll votes will be read from this Twitch channel chat via IRC WebSocket.
        </p>
        <OnboardingForm
          channelLogin={context.workspace.channelLogin}
          channelDisplayName={context.workspace.channelDisplayName}
        />
      </section>
    </main>
  );
}

