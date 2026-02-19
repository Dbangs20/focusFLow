import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getPrisma } from "@/lib/prisma";
import { ensureAuthSchemaOnce } from "@/lib/ensureAuthSchema";
import { ensureGroupRoleSchemaOnce } from "@/lib/ensureGroupRoleSchema";

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

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

export async function POST(req: Request) {
  const prisma = getPrisma();
  await ensureAuthSchemaOnce(prisma);
  await ensureGroupRoleSchemaOnce(prisma);

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { groupName } = (await req.json()) as { groupName?: string };
  const normalizedGroupName = (groupName || "").trim();
  if (!normalizedGroupName) {
    return NextResponse.json({ error: "groupName is required" }, { status: 400 });
  }

  const groups = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT "id", "name" FROM "Group" WHERE "name" = $1 LIMIT 1;`,
    normalizedGroupName,
  );

  let group = groups[0];

  if (!group) {
    const created = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
      `
      INSERT INTO "Group" ("id", "name")
      VALUES ($1, $2)
      RETURNING "id", "name";
      `,
      makeId(),
      normalizedGroupName,
    );
    group = created[0];

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "Membership" ("id", "role", "userId", "groupId")
      VALUES ($1, 'admin', $2, $3)
      ON CONFLICT ("userId", "groupId") DO NOTHING;
      `,
      makeId(),
      userId,
      group.id,
    );

    return NextResponse.json({ joined: true, groupId: group.id, groupName: group.name, role: "admin" });
  }

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "Membership" ("id", "role", "userId", "groupId")
    VALUES ($1, 'member', $2, $3)
    ON CONFLICT ("userId", "groupId") DO NOTHING;
    `,
    makeId(),
    userId,
    group.id,
  );

  const memberships = await prisma.$queryRawUnsafe<Array<{ role: string }>>(
    `
    SELECT "role"
    FROM "Membership"
    WHERE "userId" = $1 AND "groupId" = $2
    LIMIT 1;
    `,
    userId,
    group.id,
  );

  const role = memberships[0]?.role || "member";
  return NextResponse.json({ joined: true, groupId: group.id, groupName: group.name, role });
}
