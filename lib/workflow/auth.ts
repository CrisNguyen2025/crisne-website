import { auth } from "@/auth";
import { getOwnerEmails, hasValidAdminKey, isOwnerEmail } from "@/lib/auth/owner-access";
import { requireWriteAccess } from "@/lib/auth/write-access";
import { NextResponse } from "next/server";

export { requireWriteAccess };

export async function getWorkflowOwner(req: Request): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (isOwnerEmail(email)) return email!.trim().toLowerCase();
  if (hasValidAdminKey(req)) {
    const [firstOwner] = getOwnerEmails();
    return firstOwner ?? "admin@owner.com";
  }
  return null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function notFoundResponse(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function badRequestResponse(message = "Bad request") {
  return NextResponse.json({ error: message }, { status: 400 });
}
