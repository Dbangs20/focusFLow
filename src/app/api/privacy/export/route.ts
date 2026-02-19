import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureFocusSessionSchemaOnce } from "@/lib/ensureFocusSessionSchema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureFocusSessionSchemaOnce(prisma);

  const tasks = await prisma.$queryRawUnsafe<Array<{ id: string; content: string; createdAt: Date }>>(
    `
    SELECT "id", "content", "createdAt"
    FROM "Task"
    WHERE "userId" = $1
    ORDER BY "createdAt" DESC;
    `,
    user.id,
  );

  const sessions = await prisma.$queryRawUnsafe<
    Array<{ sessionId: string; sessionName: string; goal: string; recap: string | null; joinedAt: Date | null }>
  >(
    `
    SELECT
      fs."id" AS "sessionId",
      fs."name" AS "sessionName",
      uis."goal" AS "goal",
      uis."recap" AS "recap",
      fs."startedAt" AS "joinedAt"
    FROM "UserInSession" uis
    INNER JOIN "FocusSession" fs ON fs."id" = uis."focusSessionId"
    WHERE uis."userId" = $1
    ORDER BY fs."createdAt" DESC;
    `,
    user.id,
  );

  const memberships = await prisma.$queryRawUnsafe<Array<{ groupId: string; role: string }>>(
    `
    SELECT "groupId", "role"
    FROM "Membership"
    WHERE "userId" = $1;
    `,
    user.id,
  );

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    tasks,
    sessions,
    memberships,
  });
}
