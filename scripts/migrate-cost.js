const Database = require("better-sqlite3");
const db = new Database("./dev.db");

try {
  db.exec("ALTER TABLE ScheduleTask ADD COLUMN plannedCost REAL");
  console.log("Added plannedCost to ScheduleTask");
} catch (e) {
  console.log("plannedCost already exists:", e.message);
}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS CostEntry (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'labor',
    description TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (projectId) REFERENCES Project(id)
  )`);
  console.log("Created CostEntry table");
} catch (e) {
  console.log("CostEntry error:", e.message);
}

db.close();
console.log("Migration complete");
