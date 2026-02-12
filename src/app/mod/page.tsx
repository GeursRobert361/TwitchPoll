import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/DashboardClient";
import { LogoutButton } from "@/components/LogoutButton";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { getServerWorkspaceContext } from "@/lib/serverSession";
import { toWorkspaceSummary } from "@/lib/workspaceMapper";

export default async function ModDashboardPage(): Promise<React.ReactElement> {
  const context = await getServerWorkspaceContext();

  if (!context) {
    redirect("/");
  }

  if (context.isOwner) {
    redirect("/dashboard");
  }

  const polls = await listWorkspacePolls(context.workspace.id);

  return (
    <main className="grid" style={{ gap: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="muted">Signed in as moderator: {context.moderator?.displayName}</div>
        <LogoutButton />
      </div>

      <DashboardClient role="MOD" workspace={toWorkspaceSummary(context.workspace)} initialPolls={polls} />
    </main>
  );
}

