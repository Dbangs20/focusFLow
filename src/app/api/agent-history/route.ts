import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ensureAgentSchemaOnce } from "@/lib/ensureAgentSchema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const prisma = getPrisma();
  await ensureAgentSchemaOnce(prisma);

  const nudges = await prisma.$queryRawUnsafe<
    Array<{ id: string; message: string; kind: string; response: string | null; createdAt: Date }>
  >(
    `
    SELECT "id", "message", "kind", "response", "createdAt"
    FROM "AgentNudge"
    WHERE "userId" = $1
    ORDER BY "createdAt" DESC
    LIMIT 10;
    `,
    user.id,
  );

  const scoreRows = await prisma.$queryRawUnsafe<Array<{ score: number; createdAt: Date }>>(
    `
    SELECT "score", "createdAt"
    FROM "UserFocusScoreLog"
    WHERE "userId" = $1
    ORDER BY "createdAt" DESC
    LIMIT 12;
    `,
    user.id,
  );

  const stats = await prisma.$queryRawUnsafe<
    Array<{ helpfulCount: number; notNowCount: number; acknowledgedCount: number }>
  >(
    `
    SELECT
      COALESCE(SUM(CASE WHEN "response" = 'helpful' THEN 1 ELSE 0 END), 0)::INT AS "helpfulCount",
      COALESCE(SUM(CASE WHEN "response" = 'not_now' THEN 1 ELSE 0 END), 0)::INT AS "notNowCount",
      COALESCE(SUM(CASE WHEN "acknowledged" = TRUE THEN 1 ELSE 0 END), 0)::INT AS "acknowledgedCount"
    FROM "AgentNudge"
    WHERE "userId" = $1;
    `,
    user.id,
  );

  const stateRows = await prisma.$queryRawUnsafe<
    Array<{ reliabilityScore: number; overdueCount: number; lastOverdueAt: Date | null }>
  >(
    `
    SELECT "reliabilityScore", "overdueCount", "lastOverdueAt"
    FROM "UserFocusState"
    WHERE "userId" = $1
    LIMIT 1;
    `,
    user.id,
  );
  const state = stateRows[0];

  const points = [...scoreRows].reverse().map((row) => row.score);
  const first = points[0];
  const last = points[points.length - 1];
  const trend = points.length < 2 ? "stable" : last > first ? "up" : last < first ? "down" : "stable";

  return NextResponse.json({
    nudges,
    scoreTrend: trend,
    scorePoints: points,
    stats: stats[0] || { helpfulCount: 0, notNowCount: 0, acknowledgedCount: 0 },
    reliabilityScore: state?.reliabilityScore ?? 100,
    overdueCount: state?.overdueCount ?? 0,
    lastOverdueAt: state?.lastOverdueAt ?? null,
  });
}
