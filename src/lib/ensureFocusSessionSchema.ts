type PrismaExecutor = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

const globalForFocusSessionSchema = globalThis as unknown as {
  focusSessionSchemaReady?: Promise<void>;
};

export const ensureFocusSessionColumns = async (prisma: PrismaExecutor) => {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "FocusSession" ADD COLUMN IF NOT EXISTS "adminUserId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "FocusSession" ADD COLUMN IF NOT EXISTS "goal" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "FocusSession" ADD COLUMN IF NOT EXISTS "recap" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "FocusSession" ADD COLUMN IF NOT EXISTS "teamSessionId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "FocusSession" ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER;
  `);
};

export const ensureFocusSessionSchema = async (prisma: PrismaExecutor) => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "FocusSession" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "adminUserId" TEXT,
      "durationSeconds" INTEGER,
      "goal" TEXT,
      "recap" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "startedAt" TIMESTAMP(3),
      "endedAt" TIMESTAMP(3),
      "teamSessionId" TEXT,
      CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
    );
  `);

  await ensureFocusSessionColumns(prisma);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "FocusSession_startedAt_idx" ON "FocusSession"("startedAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "FocusSession_endedAt_idx" ON "FocusSession"("endedAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "FocusSession_teamSessionId_idx" ON "FocusSession"("teamSessionId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "FocusSession_adminUserId_idx" ON "FocusSession"("adminUserId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TeamFocusSession" (
      "id" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TeamFocusSession_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserHiddenSession" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "sessionId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserHiddenSession_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserHiddenSession_userId_sessionId_key"
    ON "UserHiddenSession"("userId", "sessionId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserHiddenSession_userId_idx"
    ON "UserHiddenSession"("userId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserInSession" (
      "id" TEXT NOT NULL,
      "userName" TEXT NOT NULL,
      "goal" TEXT NOT NULL,
      "recap" TEXT,
      "breakActive" BOOLEAN NOT NULL DEFAULT FALSE,
      "breakStartedAt" TIMESTAMP(3),
      "breakEndsAt" TIMESTAMP(3),
      "breakRelaxationsUsed" INTEGER NOT NULL DEFAULT 0,
      "breakPausedSeconds" INTEGER NOT NULL DEFAULT 0,
      "breakEscalatedAt" TIMESTAMP(3),
      "focusSessionId" TEXT NOT NULL,
      "userId" TEXT,
      CONSTRAINT "UserInSession_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserInSession"
    ADD COLUMN IF NOT EXISTS "breakActive" BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserInSession"
    ADD COLUMN IF NOT EXISTS "breakStartedAt" TIMESTAMP(3);
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserInSession"
    ADD COLUMN IF NOT EXISTS "breakEndsAt" TIMESTAMP(3);
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserInSession"
    ADD COLUMN IF NOT EXISTS "breakRelaxationsUsed" INTEGER NOT NULL DEFAULT 0;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserInSession"
    ADD COLUMN IF NOT EXISTS "breakPausedSeconds" INTEGER NOT NULL DEFAULT 0;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "UserInSession"
    ADD COLUMN IF NOT EXISTS "breakEscalatedAt" TIMESTAMP(3);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserInSession_focusSessionId_idx"
    ON "UserInSession"("focusSessionId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserInSession_userId_idx"
    ON "UserInSession"("userId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'FocusSession_teamSessionId_fkey'
      ) THEN
        ALTER TABLE "FocusSession"
        ADD CONSTRAINT "FocusSession_teamSessionId_fkey"
        FOREIGN KEY ("teamSessionId") REFERENCES "TeamFocusSession"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
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
        WHERE conname = 'UserInSession_focusSessionId_fkey'
      ) THEN
        ALTER TABLE "UserInSession"
        ADD CONSTRAINT "UserInSession_focusSessionId_fkey"
        FOREIGN KEY ("focusSessionId") REFERENCES "FocusSession"("id")
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
        WHERE conname = 'UserInSession_userId_fkey'
      ) THEN
        ALTER TABLE "UserInSession"
        ADD CONSTRAINT "UserInSession_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
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
        WHERE conname = 'UserHiddenSession_userId_fkey'
      ) THEN
        ALTER TABLE "UserHiddenSession"
        ADD CONSTRAINT "UserHiddenSession_userId_fkey"
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
        WHERE conname = 'UserHiddenSession_sessionId_fkey'
      ) THEN
        ALTER TABLE "UserHiddenSession"
        ADD CONSTRAINT "UserHiddenSession_sessionId_fkey"
        FOREIGN KEY ("sessionId") REFERENCES "FocusSession"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END
    $$;
  `);
};

export const ensureFocusSessionSchemaOnce = (prisma: PrismaExecutor) => {
  if (!globalForFocusSessionSchema.focusSessionSchemaReady) {
    globalForFocusSessionSchema.focusSessionSchemaReady = ensureFocusSessionSchema(prisma);
  }
  return globalForFocusSessionSchema.focusSessionSchemaReady;
};
