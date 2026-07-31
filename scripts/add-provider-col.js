const Database = require('better-sqlite3');
const db = new Database('./dev.db');
try {
  db.exec("ALTER TABLE ModelConfig ADD COLUMN provider TEXT NOT NULL DEFAULT 'anthropic'");
  console.log('Column provider added to ModelConfig');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('Column already exists — skipping');
  } else {
    throw e;
  }
}
const rows = db.prepare('SELECT agent, model, provider FROM ModelConfig').all();
console.log('Current rows:', JSON.stringify(rows, null, 2));
