type PrismaExecutor = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

const globalForAgentSchema = globalThis as unknown as {
  agentSchemaReady?: Promise<void>;
};

export const ensureAgentSchema = async (prisma: PrismaExecutor) => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserFocusState" (
      "userId" TEXT NOT NULL,
      "lastActivityAt" TIMESTAMP(3),
      "focusScore" INTEGER NOT NULL DEFAULT 80,
      "reliabilityScore" INTEGER NOT NULL DEFAULT 100,
      "overdueCount" INTEGER NOT NULL DEFAULT 0,
      "lastOverdueAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserFocusState_pkey" PRIMARY KEY ("userId")
    );
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserFocusState"
    ADD COLUMN IF NOT EXISTS "reliabilityScore" INTEGER NOT NULL DEFAULT 100;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserFocusState"
    ADD COLUMN IF NOT EXISTS "overdueCount" INTEGER NOT NULL DEFAULT 0;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserFocusState"
    ADD COLUMN IF NOT EXISTS "lastOverdueAt" TIMESTAMP(3);
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserFocusState_userId_fkey'
      ) THEN
        ALTER TABLE "UserFocusState"
        ADD CONSTRAINT "UserFocusState_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AgentNudge" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "acknowledged" BOOLEAN NOT NULL DEFAULT FALSE,
      "response" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentNudge_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AgentNudge_userId_createdAt_idx" ON "AgentNudge"("userId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AgentNudge_userId_fkey'
      ) THEN
        ALTER TABLE "AgentNudge"
        ADD CONSTRAINT "AgentNudge_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserFocusScoreLog" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "score" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserFocusScoreLog_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserFocusScoreLog_userId_createdAt_idx"
    ON "UserFocusScoreLog"("userId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserFocusScoreLog_userId_fkey'
      ) THEN
        ALTER TABLE "UserFocusScoreLog"
        ADD CONSTRAINT "UserFocusScoreLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserGamification" (
      "userId" TEXT NOT NULL,
      "totalPoints" INTEGER NOT NULL DEFAULT 0,
      "currentStreak" INTEGER NOT NULL DEFAULT 0,
      "longestStreak" INTEGER NOT NULL DEFAULT 0,
      "lastSessionDate" DATE,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserGamification_pkey" PRIMARY KEY ("userId")
    );
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserGamification_userId_fkey'
      ) THEN
        ALTER TABLE "UserGamification"
        ADD CONSTRAINT "UserGamification_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);
};

export const ensureAgentSchemaOnce = (prisma: PrismaExecutor) => {
  if (!globalForAgentSchema.agentSchemaReady) {
    globalForAgentSchema.agentSchemaReady = ensureAgentSchema(prisma);
  }
  return globalForAgentSchema.agentSchemaReady;
};
