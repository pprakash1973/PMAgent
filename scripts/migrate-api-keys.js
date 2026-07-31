const Database = require("better-sqlite3");
const db = new Database("./dev.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key"       TEXT NOT NULL PRIMARY KEY,
    "value"     TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT
  )
`).run();

console.log("SystemSetting table ready.");
db.close();
