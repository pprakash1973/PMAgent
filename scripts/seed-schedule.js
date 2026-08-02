const Database = require('better-sqlite3');
const db = new Database('dev.db');
const proj = db.prepare('SELECT id FROM Project LIMIT 1').get();
if (!proj) { console.log('no project'); process.exit(1); }
const pid = proj.id;
const tasks = [
  { id: 'task1', projectId: pid, wbsCode: '1.1', name: 'Project charter', phase: 'Initiation', baselineStart: '2025-01-06', baselineFinish: '2025-01-10', baselineDays: 5, percentComplete: 100, status: 'complete' },
  { id: 'task2', projectId: pid, wbsCode: '1.2', name: 'Stakeholder analysis', phase: 'Initiation', baselineStart: '2025-01-13', baselineFinish: '2025-01-17', baselineDays: 5, percentComplete: 80, status: 'in_progress' },
  { id: 'task3', projectId: pid, wbsCode: '1.3', name: 'Risk register setup', phase: 'Initiation', baselineStart: '2025-01-20', baselineFinish: '2025-01-22', baselineDays: 3, percentComplete: 0, status: 'not_started' },
  { id: 'task4', projectId: pid, wbsCode: '2.1', name: 'Requirements gathering', phase: 'Planning', baselineStart: '2025-01-27', baselineFinish: '2025-02-07', baselineDays: 10, percentComplete: 60, status: 'in_progress' },
  { id: 'task5', projectId: pid, wbsCode: '2.2', name: 'Solution design', phase: 'Planning', baselineStart: '2025-02-10', baselineFinish: '2025-02-21', baselineDays: 10, percentComplete: 0, status: 'not_started' },
  { id: 'task6', projectId: pid, wbsCode: '3.1', name: 'Sprint 1 development', phase: 'Execution', baselineStart: '2025-02-24', baselineFinish: '2025-03-07', baselineDays: 10, percentComplete: 0, status: 'not_started' },
];
const ins = db.prepare(
  "INSERT OR REPLACE INTO ScheduleTask (id, projectId, wbsCode, name, phase, baselineStart, baselineFinish, baselineDays, percentComplete, status, createdAt, updatedAt) VALUES (@id, @projectId, @wbsCode, @name, @phase, @baselineStart, @baselineFinish, @baselineDays, @percentComplete, @status, datetime('now'), datetime('now'))"
);
tasks.forEach(t => ins.run(t));
console.log('inserted', tasks.length, 'tasks for project', pid);
