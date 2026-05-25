// GET /api/favorites — get user's favorite tags
// POST /api/favorites — add a tag to favorites
// DELETE /api/favorites — remove a tag from favorites

import { NextRequest, NextResponse } from "next/server";

// NOTE: This is a placeholder API for future multi-user support
// Currently, favorites are stored in localStorage on client-side only
// When authentication is added, this will use database with userId

export const dynamic = "force-dynamic";

// GET /api/favorites
// Returns empty array - client uses localStorage
export async function GET() {
  try {
    // TODO: When auth is added, query database by userId
    // For now, return empty to let client use localStorage
    return NextResponse.json({
      favorites: [],
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
// Currently no-op - client handles via localStorage
export async function POST(req: NextRequest) {
  try {
    const { tagId } = await req.json();
    
    if (!tagId || typeof tagId !== "string") {
      return NextResponse.json(
        { error: "tagId is required" },
        { status: 400 }
      );
    }

    // TODO: When auth is added, save to database with userId
    // For now, just return success (client handles localStorage)

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/favorites]", err);
    return NextResponse.json(
      { error: "Failed to add favorite" },
      { status: 500 }
    );
  }
}

// DELETE /api/favorites?tagId=xxx
// Currently no-op - client handles via localStorage
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

    // TODO: When auth is added, delete from database by userId + tagId
    // For now, just return success (client handles localStorage)

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/favorites]", err);
    return NextResponse.json(
      { error: "Failed to remove favorite" },
      { status: 500 }
    );
  }
}
