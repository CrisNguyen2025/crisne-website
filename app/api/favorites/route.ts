// GET /api/favorites — get user's favorite tags
// POST /api/favorites — add a tag to favorites
// DELETE /api/favorites — remove a tag from favorites

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
    
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      select: { tagId: true },
    });
    
    return NextResponse.json({
      favorites: favorites.map(f => f.tagId),
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
    
    if (!tagId || typeof tagId !== "string") {
      return NextResponse.json(
        { error: "tagId is required" },
        { status: 400 }
      );
    }

    // Upsert to handle duplicates gracefully
    await prisma.favorite.upsert({
      where: {
        userId_tagId: { userId, tagId },
      },
      update: {},
      create: { userId, tagId },
    });

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

    await prisma.favorite.deleteMany({
      where: { userId, tagId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/favorites]", err);
    return NextResponse.json(
      { error: "Failed to remove favorite" },
      { status: 500 }
    );
  }
}
