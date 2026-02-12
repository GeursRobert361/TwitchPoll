import { redirect } from "next/navigation";

import { DashboardClient } from "@/components/DashboardClient";
import { LogoutButton } from "@/components/LogoutButton";
import { listWorkspacePolls } from "@/lib/pollMapper";
import { prisma } from "@/lib/prisma";
import { getServerWorkspaceContext } from "@/lib/serverSession";
import { toWorkspaceSummary } from "@/lib/workspaceMapper";

export default async function DashboardPage(): Promise<React.ReactElement> {
  const context = await getServerWorkspaceContext();

  if (!context || !context.isOwner) {
    redirect("/");
  }

  const polls = await listWorkspacePolls(context.workspace.id);

  const [moderators, invites] = await Promise.all([
    prisma.moderator.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        revokedAt: true,
        lastSeenAt: true,
        createdAt: true
      }
    }),
    prisma.modInvite.findMany({
      where: { workspaceId: context.workspace.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        createdAt: true,
        moderator: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    })
  ]);

  return (
    <main className="grid" style={{ gap: "1rem" }}>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <LogoutButton />
      </div>

      <DashboardClient
        role="OWNER"
        workspace={toWorkspaceSummary(context.workspace)}
        initialPolls={polls}
        initialModerators={moderators.map((moderator) => ({
          id: moderator.id,
          displayName: moderator.displayName,
          revokedAt: moderator.revokedAt ? moderator.revokedAt.toISOString() : null,
          lastSeenAt: moderator.lastSeenAt ? moderator.lastSeenAt.toISOString() : null,
          createdAt: moderator.createdAt.toISOString()
        }))}
        initialInvites={invites.map((invite) => ({
          id: invite.id,
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt ? invite.usedAt.toISOString() : null,
          revokedAt: invite.revokedAt ? invite.revokedAt.toISOString() : null,
          createdAt: invite.createdAt.toISOString(),
          moderator: invite.moderator
        }))}
      />
    </main>
  );
}

