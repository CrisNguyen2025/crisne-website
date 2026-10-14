import { auth } from "@/auth";
import { hasValidAdminKey, isOwnerEmail } from "./owner-access";

/** True when the request comes from the signed-in owner (Google) or carries a valid admin key. */
export async function hasWriteAccess(req: Request): Promise<boolean> {
  if (hasValidAdminKey(req)) return true;

  try {
    const session = await auth();
    return isOwnerEmail(session?.user?.email);
  } catch (error) {
    // e.g. AUTH_SECRET not configured: treat as signed out rather than failing open
    console.error("Auth session check failed:", error);
    return false;
  }
}

/**
 * Guard for mutating route handlers. Returns a 401 response to send back, or null when allowed:
 *
 *   const denied = await requireWriteAccess(req);
 *   if (denied) return denied;
 */
export async function requireWriteAccess(req: Request): Promise<Response | null> {
  if (await hasWriteAccess(req)) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
