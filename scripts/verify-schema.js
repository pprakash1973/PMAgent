const Database = require('better-sqlite3');
const db = new Database('./dev.db');
const cols = db.prepare('PRAGMA table_info(ModelConfig)').all();
console.log('ModelConfig columns:', cols.map(c => c.name + ':' + c.type + (c.dflt_value ? '='+c.dflt_value : '')).join(', '));
