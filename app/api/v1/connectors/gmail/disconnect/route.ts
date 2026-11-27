import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { disconnectGmailConnector } from "@/lib/connectors/gmail-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  try {
    await disconnectGmailConnector();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API POST /api/v1/connectors/gmail/disconnect] Error:", error);
    return NextResponse.json(
      { error: "Chưa ngắt được kết nối Gmail" },
      { status: 500 }
    );
  }
}
