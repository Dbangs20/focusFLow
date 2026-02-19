import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureGroupRoleSchemaOnce } from "@/lib/ensureGroupRoleSchema";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const ensureGroupTaskTable = async () => {
  const prisma = getPrisma();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GroupTask" (
      "id" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "groupRefId" TEXT,
      CONSTRAINT "GroupTask_pkey" PRIMARY KEY ("id")
    );
  `);
};

const getCurrentUserId = async () => {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id?.trim();
  if (sessionUserId) {
    return sessionUserId;
  }

  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user?.id ?? null;
};

const getUserRole = async (userId: string, groupId: string) => {
  const prisma = getPrisma();
  const rows = await prisma.$queryRawUnsafe<Array<{ role: string }>>(
    `
    SELECT "role" FROM "Membership"
    WHERE "userId" = $1 AND "groupId" = $2
    LIMIT 1;
    `,
    userId,
    groupId,
  );
  return rows[0]?.role ?? null;
};

export async function POST(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);
  await ensureGroupTaskTable();

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { groupId, content } = (await req.json()) as {
      groupId?: string;
      content?: string;
    };

    const normalizedGroupId = (groupId || "").trim();
    const normalizedContent = (content || "").trim();
    if (!normalizedGroupId || !normalizedContent) {
      return NextResponse.json({ error: "groupId and content are required" }, { status: 400 });
    }

    const role = await getUserRole(userId, normalizedGroupId);
    if (!role) {
      return NextResponse.json({ error: "You are not a member of this group." }, { status: 403 });
    }

    const inserted = await prisma.$queryRawUnsafe<Array<{
      id: string;
      groupId: string;
      content: string;
      createdAt: Date;
    }>>(
      `
      INSERT INTO "GroupTask" ("id", "groupId", "content")
      VALUES ($1, $2, $3)
      RETURNING "id", "groupId", "content", "createdAt";
      `,
      makeId(),
      normalizedGroupId,
      normalizedContent,
    );

    return NextResponse.json(inserted[0]);
  } catch (err) {
    console.error("🔥 Group POST error:", err);
    return NextResponse.json({ error: "Failed to add task" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);
  await ensureGroupTaskTable();

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get("groupId")?.trim();
  if (!groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  try {
    const role = await getUserRole(userId, groupId);
    if (!role) {
      return NextResponse.json({ error: "You are not a member of this group." }, { status: 403 });
    }

    const tasks = await prisma.$queryRawUnsafe<Array<{
      id: string;
      groupId: string;
      content: string;
      createdAt: Date;
    }>>(
      `
      SELECT "id", "groupId", "content", "createdAt"
      FROM "GroupTask"
      WHERE "groupId" = $1
      ORDER BY "createdAt" DESC;
      `,
      groupId,
    );

    return NextResponse.json(tasks);
  } catch (err) {
    console.error("🔥 Group GET error:", err);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);
  await ensureGroupTaskTable();

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { groupId, taskId } = (await req.json()) as { groupId?: string; taskId?: string };
    const normalizedGroupId = (groupId || "").trim();
    const normalizedTaskId = (taskId || "").trim();

    if (!normalizedGroupId || !normalizedTaskId) {
      return NextResponse.json({ error: "groupId and taskId are required" }, { status: 400 });
    }

    const role = await getUserRole(userId, normalizedGroupId);
    if (role !== "admin") {
      return NextResponse.json({ error: "Only admins can delete tasks." }, { status: 403 });
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "GroupTask" WHERE "id" = $1 AND "groupId" = $2;`,
      normalizedTaskId,
      normalizedGroupId,
    );

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("🔥 Group DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
