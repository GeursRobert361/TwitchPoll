import { redirect } from "next/navigation";

import { getServerWorkspaceContext } from "@/lib/serverSession";

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const context = await getServerWorkspaceContext();

  if (!context || !context.isOwner) {
    redirect("/");
  }

  redirect("/dashboard");
}

