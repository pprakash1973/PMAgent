-- UAT Cycle 1 Remediation — WP-2 and WP-3 schema additions
-- WP-2 (DEF-001): Configurable temperature per agent
ALTER TABLE "ModelConfig" ADD COLUMN IF NOT EXISTS "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- WP-3 (DEF-002): Persist GR-11 integrity violations so the override rate is queryable
ALTER TABLE "StatusReport" ADD COLUMN IF NOT EXISTS "violations" JSONB;
