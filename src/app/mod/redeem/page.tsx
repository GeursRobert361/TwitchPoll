import { ModRedeemForm } from "@/components/ModRedeemForm";

type Props = {
  searchParams?: {
    token?: string;
  };
};

export default function ModRedeemPage({ searchParams }: Props): React.ReactElement {
  const token = searchParams?.token ?? "";

  return (
    <main style={{ maxWidth: 620 }}>
      <section className="card" style={{ padding: "1.4rem" }}>
        <h1 style={{ marginTop: 0 }}>Redeem moderator invite</h1>
        <p className="muted">No Twitch login is needed. Enter token and your display name.</p>
        <ModRedeemForm initialToken={token} />
      </section>
    </main>
  );
}

