const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "../dev.db"));
try {
  db.exec("ALTER TABLE Project ADD COLUMN currentPhase TEXT NOT NULL DEFAULT 'initiation'");
  console.log("Column currentPhase added successfully");
} catch (e) {
  if (e.message.includes("duplicate column name")) {
    console.log("Column already exists");
  } else {
    console.error("Error:", e.message);
    process.exit(1);
  }
} finally {
  db.close();
}
