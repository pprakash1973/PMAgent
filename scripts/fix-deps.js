const Database = require('better-sqlite3');
const db = new Database('dev.db');
db.prepare("UPDATE ScheduleTask SET dependencies = '[]' WHERE dependencies IS NULL OR dependencies = ''").run();
console.log('fixed dependencies');
