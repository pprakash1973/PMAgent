ALTER TABLE "Artifact" ADD COLUMN IF NOT EXISTS "scopeBaselineId" TEXT;

CREATE TABLE IF NOT EXISTS "assumptions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'open',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assumptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "budget_revisions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "changeRequestId" TEXT,
    "previousBudget" DECIMAL(65,30) NOT NULL,
    "newBudget" DECIMAL(65,30) NOT NULL,
    "delta" DECIMAL(65,30) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollectionCycle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "label" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "taskIds" JSONB NOT NULL DEFAULT '[]',
    "dispatchedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CollectionCycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CollectionToken" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "decisions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "decisionId" TEXT,
    "title" TEXT NOT NULL,
    "rationale" TEXT,
    "madeBy" TEXT,
    "madeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "linkedRef" TEXT,
    "linkedType" TEXT,
    "sprintId" TEXT,
    "sprintLabel" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "dependencies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'external',
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "scope_baselines" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '[]',
    "removedSnapshot" JSONB NOT NULL DEFAULT '[]',
    "impactSummary" JSONB,
    "requirementCount" INTEGER NOT NULL DEFAULT 0,
    "deltaReviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scope_baselines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TaskActualsLedger" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "hoursWorked" DOUBLE PRECISION NOT NULL,
    "percentComplete" INTEGER NOT NULL,
    "etcHours" DOUBLE PRECISION,
    "disposition" TEXT NOT NULL,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededById" TEXT,

    CONSTRAINT "TaskActualsLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TaskAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assumptions_projectId_idx" ON "assumptions"("projectId");

CREATE INDEX IF NOT EXISTS "budget_revisions_projectId_idx" ON "budget_revisions"("projectId");

CREATE INDEX IF NOT EXISTS "CollectionCycle_projectId_status_idx" ON "CollectionCycle"("projectId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "CollectionCycle_projectId_cycleNumber_key" ON "CollectionCycle"("projectId", "cycleNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "CollectionToken_tokenHash_key" ON "CollectionToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "CollectionToken_cycleId_idx" ON "CollectionToken"("cycleId");

CREATE INDEX IF NOT EXISTS "CollectionToken_resourceId_idx" ON "CollectionToken"("resourceId");

CREATE INDEX IF NOT EXISTS "decisions_projectId_status_idx" ON "decisions"("projectId", "status");

CREATE INDEX IF NOT EXISTS "dependencies_projectId_idx" ON "dependencies"("projectId");

CREATE INDEX IF NOT EXISTS "scope_baselines_projectId_idx" ON "scope_baselines"("projectId");

CREATE UNIQUE INDEX IF NOT EXISTS "scope_baselines_projectId_version_key" ON "scope_baselines"("projectId", "version");

CREATE INDEX IF NOT EXISTS "TaskActualsLedger_projectId_cycleId_idx" ON "TaskActualsLedger"("projectId", "cycleId");

CREATE INDEX IF NOT EXISTS "TaskActualsLedger_taskId_cycleId_idx" ON "TaskActualsLedger"("taskId", "cycleId");

CREATE INDEX IF NOT EXISTS "TaskActualsLedger_tokenId_idx" ON "TaskActualsLedger"("tokenId");

CREATE INDEX IF NOT EXISTS "TaskAssignment_projectId_idx" ON "TaskAssignment"("projectId");

CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignment_taskId_resourceId_key" ON "TaskAssignment"("taskId", "resourceId");

DO $$ BEGIN
  ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_scopeBaselineId_fkey" FOREIGN KEY ("scopeBaselineId") REFERENCES "scope_baselines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "assumptions" ADD CONSTRAINT "assumptions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollectionCycle" ADD CONSTRAINT "CollectionCycle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollectionToken" ADD CONSTRAINT "CollectionToken_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CollectionCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollectionToken" ADD CONSTRAINT "CollectionToken_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ProjectResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CollectionToken" ADD CONSTRAINT "CollectionToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "decisions" ADD CONSTRAINT "decisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "scope_baselines" ADD CONSTRAINT "scope_baselines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskActualsLedger" ADD CONSTRAINT "TaskActualsLedger_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskActualsLedger" ADD CONSTRAINT "TaskActualsLedger_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduleTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskActualsLedger" ADD CONSTRAINT "TaskActualsLedger_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ProjectResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskActualsLedger" ADD CONSTRAINT "TaskActualsLedger_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "CollectionCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskActualsLedger" ADD CONSTRAINT "TaskActualsLedger_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "CollectionToken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ProjectResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
