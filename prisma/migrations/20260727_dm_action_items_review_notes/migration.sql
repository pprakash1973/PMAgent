-- Delivery Manager: Action Items, Action Item Events, DM Review Notes
-- Migration: 20260727_dm_action_items_review_notes

CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'schedule',
    "priority" TEXT NOT NULL DEFAULT 'p2',
    "dueDate" TIMESTAMP(3),
    "originalDueDate" TIMESTAMP(3),
    "assignedToId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "expectedOutcome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "blockedReason" TEXT,
    "pmResponse" TEXT,
    "closedById" TEXT,
    "closureNote" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "action_item_events" (
    "id" TEXT NOT NULL,
    "actionItemId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_item_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dm_review_notes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL DEFAULT 'ad_hoc',
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'shared_with_pm',
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dm_review_notes_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "action_items_reference_key" ON "action_items"("reference");

-- Indexes
CREATE INDEX "action_items_projectId_status_idx" ON "action_items"("projectId", "status");
CREATE INDEX "action_items_assignedToId_status_idx" ON "action_items"("assignedToId", "status");
CREATE INDEX "action_items_raisedById_idx" ON "action_items"("raisedById");
CREATE INDEX "action_item_events_actionItemId_idx" ON "action_item_events"("actionItemId");
CREATE INDEX "dm_review_notes_projectId_idx" ON "dm_review_notes"("projectId");

-- Foreign keys
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_raisedById_fkey"
    FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "action_item_events" ADD CONSTRAINT "action_item_events_actionItemId_fkey"
    FOREIGN KEY ("actionItemId") REFERENCES "action_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "action_item_events" ADD CONSTRAINT "action_item_events_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dm_review_notes" ADD CONSTRAINT "dm_review_notes_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dm_review_notes" ADD CONSTRAINT "dm_review_notes_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
