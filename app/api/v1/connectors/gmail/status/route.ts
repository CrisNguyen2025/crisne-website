import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { getGmailConnectorStatus } from "@/lib/connectors/gmail-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    const status = await getGmailConnectorStatus({ includeLabels: true });
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (error) {
    console.error("[API GET /api/v1/connectors/gmail/status] Error:", error);
    return NextResponse.json(
      { error: "Chưa tải được trạng thái Gmail Connector" },
      { status: 500, headers: NO_STORE }
    );
  }
}
