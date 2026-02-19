import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureGroupRoleSchemaOnce } from "@/lib/ensureGroupRoleSchema";

const getCurrentUserId = async () => {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id?.trim();
  if (sessionUserId) {
    return sessionUserId;
  }

  const email = (session?.user?.email || "").trim().toLowerCase();
  if (!email) return null;

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await params;
  const groupId = (resolvedParams.groupId || "").trim();
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const membershipRows = await prisma.$queryRawUnsafe<Array<{ role: string }>>(
    `
    SELECT "role"
    FROM "Membership"
    WHERE "userId" = $1 AND "groupId" = $2
    LIMIT 1;
    `,
    userId,
    groupId,
  );

  const currentRole = membershipRows[0]?.role;
  if (!currentRole) {
    return NextResponse.json({ error: "Not part of group" }, { status: 403 });
  }

  const members = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string | null; email: string | null; role: string }>
  >(
    `
    SELECT
      u."id" AS "id",
      u."name" AS "name",
      u."email" AS "email",
      m."role" AS "role"
    FROM "Membership" m
    INNER JOIN "User" u ON u."id" = m."userId"
    WHERE m."groupId" = $1
    ORDER BY
      CASE WHEN m."role" = 'admin' THEN 0 ELSE 1 END,
      COALESCE(u."name", u."email", '') ASC;
    `,
    groupId,
  );

  const aiRows = await prisma.$queryRawUnsafe<
    Array<{
      latestPlanJson: string | null;
      latestTeamSummary: string | null;
      latestAssignmentsJson: string | null;
    }>
  >(
    `
    SELECT "latestPlanJson", "latestTeamSummary", "latestAssignmentsJson"
    FROM "Group"
    WHERE "id" = $1
    LIMIT 1;
    `,
    groupId,
  );

  let latestPlan: string[] = [];
  let latestAssignments: string[] = [];
  const latestTeamSummary = (aiRows[0]?.latestTeamSummary || "").trim();
  try {
    const parsed = JSON.parse(aiRows[0]?.latestPlanJson || "[]") as unknown;
    if (Array.isArray(parsed)) latestPlan = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    latestPlan = [];
  }
  try {
    const parsed = JSON.parse(aiRows[0]?.latestAssignmentsJson || "[]") as unknown;
    if (Array.isArray(parsed)) {
      latestAssignments = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    latestAssignments = [];
  }

  return NextResponse.json({
    role: currentRole,
    members,
    latestPlan,
    latestTeamSummary,
    latestAssignments,
  });
}
