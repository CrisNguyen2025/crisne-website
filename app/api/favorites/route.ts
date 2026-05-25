// GET /api/favorites — get user's favorite tags
// POST /api/favorites — add a tag to favorites
// DELETE /api/favorites — remove a tag from favorites

import { NextRequest, NextResponse } from "next/server";
import { getFavorites, addFavorite, removeFavorite } from "@/lib/notion";

export const dynamic = "force-dynamic";

// Helper: Get or generate anonymous user ID from header
function getUserId(request: NextRequest): string {
  const userId = request.headers.get("X-User-ID");
  if (!userId) {
    throw new Error("X-User-ID header is required");
  }
  return userId;
}

// GET /api/favorites
export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    
    const favorites = await getFavorites(userId);
    
    return NextResponse.json({
      favorites,
    });
  } catch (err) {
    console.error("[GET /api/favorites]", err);
    return NextResponse.json(
      { error: "Failed to fetch favorites" },
      { status: 500 }
    );
  }
}

// POST /api/favorites
// Body: { tagId: string }
export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { tagId } = await req.json();
    
    console.log("[POST /api/favorites] userId:", userId, "tagId:", tagId);
    
    if (!tagId || typeof tagId !== "string") {
      return NextResponse.json(
        { error: "tagId is required" },
        { status: 400 }
      );
    }

    // Add to Notion
    const result = await addFavorite(userId, tagId);
    
    console.log("[POST /api/favorites] Success:", result);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/favorites] Error:", err);
    console.error("[POST /api/favorites] Error stack:", (err as Error).stack);
    return NextResponse.json(
      { error: "Failed to add favorite", details: (err as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/favorites?tagId=xxx
export async function DELETE(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId");

    if (!tagId) {
      return NextResponse.json(
        { error: "tagId is required" },
        { status: 400 }
      );
    }

    await removeFavorite(userId, tagId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/favorites]", err);
    return NextResponse.json(
      { error: "Failed to remove favorite" },
      { status: 500 }
    );
  }
}
