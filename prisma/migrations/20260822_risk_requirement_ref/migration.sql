-- Add requirement traceability column to Risk table
ALTER TABLE "Risk" ADD COLUMN IF NOT EXISTS "requirementRef" TEXT DEFAULT 'General';
