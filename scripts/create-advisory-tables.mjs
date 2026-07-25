import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "..", "dev.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS Advisory (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    ruleId TEXT NOT NULL,
    pack TEXT NOT NULL,
    class TEXT NOT NULL,
    severity TEXT NOT NULL,
    provenance TEXT NOT NULL DEFAULT 'p1',
    tab TEXT NOT NULL,
    objectType TEXT,
    objectId TEXT,
    statement TEXT NOT NULL,
    evidenceSummary TEXT NOT NULL DEFAULT '',
    draftPayload TEXT,
    state TEXT NOT NULL DEFAULT 'proposed',
    rankScore REAL NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'm1',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stateChangedAt DATETIME,
    deferredUntil DATETIME,
    FOREIGN KEY (projectId) REFERENCES Project(id) ON DELETE CASCADE,
    UNIQUE(projectId, ruleId, objectId)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS AdvisoryAction (
    id TEXT PRIMARY KEY,
    advisoryId TEXT NOT NULL,
    action TEXT NOT NULL,
    dismissalReason TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (advisoryId) REFERENCES Advisory(id) ON DELETE CASCADE
  )
`);

db.exec("CREATE INDEX IF NOT EXISTS adv_proj_state ON Advisory(projectId, state, severity)");
db.exec("CREATE INDEX IF NOT EXISTS adv_proj_tab ON Advisory(projectId, tab, state)");

console.log("Advisory tables created successfully.");
db.close();
