import { NextRequest, NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/auth/write-access";
import {
  GmailConnectorStateError,
  queryConnectedGmail,
} from "@/lib/connectors/gmail-service";
import { GmailQuerySchema } from "@/lib/connectors/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const denied = await requireWriteAccess(req);
  if (denied) return denied;

  const rawBody = await req.json().catch(() => null);
  const parsed = GmailQuerySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Tham số tìm kiếm Gmail không hợp lệ" },
      { status: 400 }
    );
  }

  try {
    const result = await queryConnectedGmail(parsed.data);
    return NextResponse.json({
      accountEmail: result.accountEmail,
      emails: result.messages,
    });
  } catch (error) {
    if (error instanceof GmailConnectorStateError) {
      if (error.code === "GMAIL_NOT_CONNECTED") {
        return NextResponse.json(
          { error: "Gmail chưa được kết nối", code: error.code },
          { status: 404 }
        );
      }
      if (error.code === "GMAIL_TOKEN_EXPIRED") {
        return NextResponse.json(
          { error: "Phiên kết nối Gmail đã hết hạn", code: error.code },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Gmail Connector chưa được cấu hình đầy đủ", code: error.code },
        { status: 503 }
      );
    }
    console.error("[API POST /api/v1/connectors/gmail/query] Error:", error);
    return NextResponse.json(
      { error: "Chưa truy vấn được Gmail" },
      { status: 500 }
    );
  }
}
