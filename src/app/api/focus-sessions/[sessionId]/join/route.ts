import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce, ensureFocusSessionColumns } from "@/lib/ensureFocusSessionSchema";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const getCurrentUser = async () => {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  const fallbackName = (session?.user?.name || "").trim();
  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) return null;

  return {
    id: user.id,
    userName: (user.name || user.email || fallbackName || email).trim(),
  };
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureFocusSessionColumns(prisma);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const normalizedSessionId = (sessionId || "").trim();
  if (!normalizedSessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { goal?: unknown; teamSessionId?: unknown };
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const teamSessionId = typeof body.teamSessionId === "string" ? body.teamSessionId.trim() : "";
  if (!goal) {
    return NextResponse.json({ error: "Goal is required" }, { status: 400 });
  }

  if (teamSessionId) {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "TeamFocusSession" ("id")
      VALUES ($1)
      ON CONFLICT ("id") DO NOTHING;
      `,
      teamSessionId,
    );
  }

  const sessionRows = await prisma.$queryRawUnsafe<Array<{ id: string; endedAt: Date | null }>>(
    `
    SELECT "id", "endedAt"
    FROM "FocusSession"
    WHERE "id" = $1
    LIMIT 1;
    `,
    normalizedSessionId,
  );

  if (!sessionRows[0]) {
    return NextResponse.json(
      { error: "Session not found. Ask admin to create one first." },
      { status: 404 },
    );
  }
  if (sessionRows[0].endedAt) {
    return NextResponse.json(
      { error: "This session has ended. You can view recap but cannot join." },
      { status: 400 },
    );
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "FocusSession"
    SET "startedAt" = COALESCE("startedAt", NOW()),
        "goal" = COALESCE("goal", $1),
        "adminUserId" = COALESCE("adminUserId", $3),
        "teamSessionId" = COALESCE("teamSessionId", $4)
    WHERE "id" = $2;
    `,
    goal,
    normalizedSessionId,
    currentUser.id,
    teamSessionId || null,
  );

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    SELECT "id"
    FROM "UserInSession"
    WHERE "focusSessionId" = $1 AND "userId" = $2
    LIMIT 1;
    `,
    normalizedSessionId,
    currentUser.id,
  );

  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `
      UPDATE "UserInSession"
      SET "goal" = $1
      WHERE "id" = $2;
      `,
      goal,
      existing[0].id,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "UserInSession" ("id", "userName", "goal", "focusSessionId", "userId")
      VALUES ($1, $2, $3, $4, $5);
      `,
      makeId(),
      currentUser.userName,
      goal,
      normalizedSessionId,
      currentUser.id,
    );
  }

  return NextResponse.json({ joined: true });
}
