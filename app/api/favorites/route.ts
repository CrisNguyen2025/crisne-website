// GET /api/favorites — get user's favorite tags
// POST /api/favorites — add a tag to favorites
// DELETE /api/favorites — remove a tag from favorites

import { NextRequest, NextResponse } from "next/server";

// Temporary in-memory storage (will be replaced with database for multi-user)
// In production, this should be stored per user in a database
let favoriteTags: Set<string> = new Set();

export const dynamic = "force-dynamic";

// GET /api/favorites
export async function GET() {
  try {
    return NextResponse.json({
      favorites: Array.from(favoriteTags),
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
    const { tagId } = await req.json();
    
    if (!tagId || typeof tagId !== "string") {
      return NextResponse.json(
        { error: "tagId is required" },
        { status: 400 }
      );
    }

    favoriteTags.add(tagId);

    return NextResponse.json({
      success: true,
      favorites: Array.from(favoriteTags),
    });
  } catch (err) {
    console.error("[POST /api/favorites]", err);
    return NextResponse.json(
      { error: "Failed to add favorite" },
      { status: 500 }
    );
  }
}

// DELETE /api/favorites?tagId=xxx
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tagId = searchParams.get("tagId");

    if (!tagId) {
      return NextResponse.json(
        { error: "tagId is required" },
        { status: 400 }
      );
    }

    favoriteTags.delete(tagId);

    return NextResponse.json({
      success: true,
      favorites: Array.from(favoriteTags),
    });
  } catch (err) {
    console.error("[DELETE /api/favorites]", err);
    return NextResponse.json(
      { error: "Failed to remove favorite" },
      { status: 500 }
    );
  }
}
