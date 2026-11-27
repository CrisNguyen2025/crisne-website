import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { updateGmailConnectorConfig } from "@/lib/connectors/gmail-service";
import { GmailConfigSchema } from "@/lib/connectors/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const rawBody = await req.json().catch(() => null);
  const parsed = GmailConfigSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Cấu hình Gmail không hợp lệ" },
      { status: 400 }
    );
  }

  try {
    const updated = await updateGmailConnectorConfig(parsed.data);
    if (!updated) {
      return NextResponse.json(
        { error: "Gmail Connector chưa được kết nối" },
        { status: 404 }
      );
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API PATCH /api/v1/connectors/gmail/config] Error:", error);
    return NextResponse.json(
      { error: "Chưa lưu được cấu hình Gmail" },
      { status: 500 }
    );
  }
}
