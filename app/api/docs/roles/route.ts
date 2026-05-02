import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDocsSchema } from "@/app/api/docs/_shared/ensure-docs-schema";

type RoleRow = {
  id: string;
  name: string;
  summary: string;
  focusTasks: string | null;
  createdAt: string;
  updatedAt: string;
};

async function seedDefaultRoles() {
  const now = new Date().toISOString();
  const defaults = [
    {
      name: "SUPER_ADMIN",
      summary: "Toàn quyền hệ thống.",
      focusTasks: "Quản trị toàn bộ hệ thống\nQuản lý permission matrix\nXử lý tình huống khẩn cấp",
    },
    {
      name: "ADMIN",
      summary: "Quản trị tenant/team.",
      focusTasks: "Quản lý users trong phạm vi\nQuản lý project\nTheo dõi vận hành",
    },
    {
      name: "STAFF",
      summary: "Thực thi tác vụ nghiệp vụ.",
      focusTasks: "Xử lý nghiệp vụ hàng ngày\nCập nhật dữ liệu được phân quyền\nTheo dõi trạng thái task",
    },
    {
      name: "CUSTOMER",
      summary: "Vai trò khách hàng/read-focused.",
      focusTasks: "Xem dữ liệu được chia sẻ\nTheo dõi tiến độ\nKhông thao tác dữ liệu nhạy cảm",
    },
  ];

  for (const role of defaults) {
    const id = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO Role (id, name, summary, focusTasks, createdAt, updatedAt)
      VALUES (${id}, ${role.name}, ${role.summary}, ${role.focusTasks}, ${now}, ${now})
    `;
  }
}

export async function GET() {
  try {
    await ensureDocsSchema();
    await seedDefaultRoles();
    const roles = await prisma.$queryRaw<RoleRow[]>`
      SELECT id, name, summary, focusTasks, createdAt, updatedAt
      FROM Role
      ORDER BY createdAt ASC
    `;
    return NextResponse.json(roles);
  } catch {
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDocsSchema();
    const body = await req.json();
    const { name, summary, focusTasks } = body as {
      name: string;
      summary: string;
      focusTasks?: string;
    };

    if (!name?.trim() || !summary?.trim()) {
      return NextResponse.json({ error: "name and summary are required" }, { status: 400 });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRaw`
      INSERT INTO Role (id, name, summary, focusTasks, createdAt, updatedAt)
      VALUES (${id}, ${name.trim()}, ${summary.trim()}, ${focusTasks?.trim() || null}, ${now}, ${now})
    `;

    return NextResponse.json(
      { id, name: name.trim(), summary: summary.trim(), focusTasks: focusTasks?.trim() || null, createdAt: now, updatedAt: now },
      { status: 201 },
    );
  } catch (err: unknown) {
    const isUniqueConstraint = err instanceof Error && err.message.includes("UNIQUE");
    return NextResponse.json(
      { error: isUniqueConstraint ? "Role already exists" : "Failed to create role" },
      { status: isUniqueConstraint ? 409 : 500 },
    );
  }
}
