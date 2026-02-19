import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce, ensureFocusSessionColumns } from "@/lib/ensureFocusSessionSchema";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const getCurrentUser = async () => {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").trim().toLowerCase();
  const name = (session?.user?.name || "").trim();

  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) return null;

  return {
    id: user.id,
    userName: (user.name || user.email || name || email).trim(),
  };
};

export async function GET() {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureFocusSessionColumns(prisma);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      adminUserId: string | null;
      createdAt: Date;
      startedAt: Date | null;
      endedAt: Date | null;
      durationSeconds: number | null;
      participantCount: number;
      isAdmin: boolean;
    }>
  >(
    `
    SELECT
      fs."id",
      fs."name",
      fs."adminUserId",
      fs."createdAt",
      fs."startedAt",
      fs."endedAt",
      fs."durationSeconds",
      COALESCE(COUNT(uis."id"), 0)::INT AS "participantCount",
      CASE WHEN fs."adminUserId" = $1 THEN TRUE ELSE FALSE END AS "isAdmin"
    FROM "FocusSession" fs
    LEFT JOIN "UserInSession" uis ON uis."focusSessionId" = fs."id"
    LEFT JOIN "UserHiddenSession" uhs
      ON uhs."sessionId" = fs."id"
      AND uhs."userId" = $1
    WHERE uhs."id" IS NULL
    GROUP BY fs."id"
    ORDER BY COALESCE(fs."startedAt", fs."createdAt") DESC
    LIMIT 30;
    `,
    currentUser.id,
  );

  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureFocusSessionColumns(prisma);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    teamSessionId?: unknown;
    durationMinutes?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const teamSessionId = typeof body.teamSessionId === "string" ? body.teamSessionId.trim() : "";
  const durationMinutes =
    typeof body.durationMinutes === "number"
      ? Math.floor(body.durationMinutes)
      : Number.parseInt(String(body.durationMinutes ?? ""), 10);
  if (!name) {
    return NextResponse.json({ error: "Session name is required" }, { status: 400 });
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 240) {
    return NextResponse.json({ error: "durationMinutes must be between 1 and 240" }, { status: 400 });
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

  const inserted = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      createdAt: Date;
      startedAt: Date | null;
      endedAt: Date | null;
      durationSeconds: number | null;
      adminUserId: string | null;
      teamSessionId: string | null;
    }>
  >(
    `
    INSERT INTO "FocusSession" ("id", "name", "startedAt", "adminUserId", "teamSessionId", "durationSeconds")
    VALUES ($1, $2, NOW(), $3, $4, $5)
    RETURNING "id", "name", "createdAt", "startedAt", "endedAt", "durationSeconds", "adminUserId", "teamSessionId";
    `,
    makeId(),
    name,
    currentUser.id,
    teamSessionId || null,
    durationMinutes * 60,
  );

  return NextResponse.json({ session: inserted[0] });
}

export async function DELETE(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);
  await ensureFocusSessionColumns(prisma);

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = (url.searchParams.get("sessionId") || "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ endedAt: Date | null }>>(
    `
    SELECT "endedAt"
    FROM "FocusSession"
    WHERE "id" = $1
    LIMIT 1;
    `,
    sessionId,
  );

  const target = rows[0];
  if (!target) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!target.endedAt) {
    return NextResponse.json({ error: "Only ended sessions can be deleted." }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "UserHiddenSession" ("id", "userId", "sessionId")
    VALUES ($1, $2, $3)
    ON CONFLICT ("userId", "sessionId") DO NOTHING;
    `,
    makeId(),
    currentUser.id,
    sessionId,
  );
  return NextResponse.json({ deleted: true, scope: "current-user" });
}
