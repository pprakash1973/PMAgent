const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  // ── BL Tables ──────────────────────────────────────────────────────────────
  const tables = [
    "artifact_version_items",
    "pmb_snapshots",
    "pmb_snapshot_members",
    "comparison_runs",
    "comparison_pairs",
    "impact_reports",
    "comparison_gold_entries",
    "accuracy_reports",
  ];

  console.log("\n── BL Tables ────────────────────────────────────");
  for (const t of tables) {
    const r = await pool.query(`SELECT COUNT(*) FROM "${t}"`);
    console.log(`  ${t}: ${r.rows[0].count} rows`);
  }

  // ── Projects ──────────────────────────────────────────────────────────────
  const proj = await pool.query(`SELECT id, name FROM "Project" LIMIT 5`);
  console.log(`\n── Projects (${proj.rowCount}) ─────────────────────────────────`);
  proj.rows.forEach((p) => console.log(`  ${p.id}  ${p.name}`));

  // ── Artifact table columns ────────────────────────────────────────────────
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='Artifact' ORDER BY ordinal_position`
  );
  console.log("\n── Artifact columns ─────────────────────────────");
  cols.rows.forEach((c) => process.stdout.write(`  ${c.column_name}\n`));

  // ── ArtifactVersions ─────────────────────────────────────────────────────
  const av = await pool.query(`SELECT COUNT(*) FROM "ArtifactVersion"`);
  console.log(`\n── ArtifactVersions: ${av.rows[0].count}`);

  // ── ArtifactVersion columns ───────────────────────────────────────────────
  const avcols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='ArtifactVersion' ORDER BY ordinal_position`
  );
  console.log("\n── ArtifactVersion columns ──────────────────────");
  avcols.rows.forEach((c) => process.stdout.write(`  ${c.column_name}\n`));

  await pool.end();
  console.log("\n✓ Done");
}

check().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
