import { env } from "@/lib/env";
import type { WorkspaceSummary } from "@/types/dashboard";

export const toWorkspaceSummary = (workspace: {
  id: string;
  channelLogin: string;
  channelDisplayName: string;
  overlaySlug: string;
  channelConfirmedAt: Date | null;
  botFilterEnabled: boolean;
  blacklistJson: string | null;
}): WorkspaceSummary => ({
  id: workspace.id,
  channelLogin: workspace.channelLogin,
  channelDisplayName: workspace.channelDisplayName,
  overlaySlug: workspace.overlaySlug,
  overlayUrl: `${env.baseUrl}/o/${workspace.overlaySlug}`,
  channelConfirmedAt: workspace.channelConfirmedAt ? workspace.channelConfirmedAt.toISOString() : null,
  botFilterEnabled: workspace.botFilterEnabled,
  blacklistUsers: workspace.blacklistJson ? (JSON.parse(workspace.blacklistJson) as string[]) : []
});

