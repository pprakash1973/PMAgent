// Hard-delete specific users by email (invitations, assignments, then user row)
// Run with: node scripts/delete-users.js
require("dotenv/config");
const { Pool } = require("pg");

const EMAILS_TO_DELETE = [
  "Kurian.Antony@ust.com",
  "Adam.Casey@ust.com",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.error("DATABASE_URL must be a postgresql:// connection string");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  try {
    for (const email of EMAILS_TO_DELETE) {
      // Find user
      const { rows } = await pool.query(`SELECT id, "fullName", status FROM "User" WHERE email = $1`, [email]);
      if (rows.length === 0) {
        console.log(`⚠  Not found: ${email}`);
        continue;
      }
      const user = rows[0];
      console.log(`Deleting ${email} (${user.fullName}, ${user.status}) id=${user.id}`);

      // Delete invitations
      const inv = await pool.query(`DELETE FROM "Invitation" WHERE "userId" = $1`, [user.id]);
      console.log(`  Removed ${inv.rowCount} invitation(s)`);

      // Delete program assignments
      const pa = await pool.query(`DELETE FROM "ProgramAssignment" WHERE "userId" = $1`, [user.id]);
      console.log(`  Removed ${pa.rowCount} program assignment(s)`);

      // Delete client assignments
      const ca = await pool.query(`DELETE FROM "ClientAssignment" WHERE "userId" = $1`, [user.id]);
      console.log(`  Removed ${ca.rowCount} client assignment(s)`);

      // Hard-delete the user
      await pool.query(`DELETE FROM "User" WHERE id = $1`, [user.id]);
      console.log(`  ✓ User deleted`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
