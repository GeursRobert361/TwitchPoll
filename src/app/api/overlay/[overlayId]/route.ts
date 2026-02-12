import { NextResponse } from "next/server";

import { buildActivePollPayloadByOverlay } from "@/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { overlayId: string } };

export async function GET(_: Request, { params }: Params): Promise<NextResponse> {
  const payload = await buildActivePollPayloadByOverlay(params.overlayId);
  return NextResponse.json(
    { poll: payload },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

