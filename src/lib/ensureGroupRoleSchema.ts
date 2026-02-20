type PrismaExecutor = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

const globalForGroupRoleSchema = globalThis as unknown as {
  groupRoleSchemaReady?: Promise<void>;
};

export const ensureGroupRoleSchema = async (prisma: PrismaExecutor) => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Group" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Group_name_key" ON "Group"("name");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Membership" (
      "id" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_groupId_key"
    ON "Membership"("userId", "groupId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Membership_userId_fkey'
      ) THEN
        ALTER TABLE "Membership"
        ADD CONSTRAINT "Membership_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Membership_groupId_fkey'
      ) THEN
        ALTER TABLE "Membership"
        ADD CONSTRAINT "Membership_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "Group"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "GroupTask"
    ADD COLUMN IF NOT EXISTS "groupRefId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Group"
    ADD COLUMN IF NOT EXISTS "latestPlanJson" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Group"
    ADD COLUMN IF NOT EXISTS "latestPlanUpdatedAt" TIMESTAMP(3);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Group"
    ADD COLUMN IF NOT EXISTS "latestTeamSummary" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Group"
    ADD COLUMN IF NOT EXISTS "latestTeamSummaryUpdatedAt" TIMESTAMP(3);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Group"
    ADD COLUMN IF NOT EXISTS "latestAssignmentsJson" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Group"
    ADD COLUMN IF NOT EXISTS "latestAssignmentsUpdatedAt" TIMESTAMP(3);
  `);
};

export const ensureGroupRoleSchemaOnce = (prisma: PrismaExecutor) => {
  if (!globalForGroupRoleSchema.groupRoleSchemaReady) {
    globalForGroupRoleSchema.groupRoleSchemaReady = ensureGroupRoleSchema(prisma);
  }
  return globalForGroupRoleSchema.groupRoleSchemaReady;
};
