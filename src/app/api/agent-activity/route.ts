import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { type?: unknown };
  const eventType = typeof body.type === "string" ? body.type.trim() : "activity";

  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureAgentSchemaOnce(prisma);

  const rows = await prisma.$queryRawUnsafe<Array<{ lastActivityAt: Date | null; focusScore: number }>>(
    `
    SELECT "lastActivityAt", "focusScore"
    FROM "UserFocusState"
    WHERE "userId" = $1
    LIMIT 1;
    `,
    user.id,
  );

  const now = Date.now();
  const previous = rows[0];
  const lastTs = previous?.lastActivityAt ? new Date(previous.lastActivityAt).getTime() : now;
  const idleSeconds = Math.max(0, Math.floor((now - lastTs) / 1000));

  let delta = 1;
  if (idleSeconds > 600) delta = -8;
  else if (idleSeconds > 300) delta = -4;
  else if (idleSeconds > 120) delta = -2;
  if (eventType === "focus") delta += 1;

  const nextScore = clamp((previous?.focusScore ?? 80) + delta, 0, 100);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "UserFocusState" ("userId", "lastActivityAt", "focusScore", "updatedAt")
    VALUES ($1, NOW(), $2, NOW())
    ON CONFLICT ("userId")
    DO UPDATE SET
      "lastActivityAt" = NOW(),
      "focusScore" = $2,
      "updatedAt" = NOW();
    `,
    user.id,
    nextScore,
  );

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "UserFocusScoreLog" ("id", "userId", "score")
    VALUES ($1, $2, $3);
    `,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    user.id,
    nextScore,
  );

  return NextResponse.json({ ok: true, focusScore: nextScore });
}
