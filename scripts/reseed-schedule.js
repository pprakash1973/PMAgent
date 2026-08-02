const Database = require('better-sqlite3');
const db = new Database('dev.db');

// Delete bad rows first
db.prepare("DELETE FROM ScheduleTask WHERE id IN ('task1','task2','task3','task4','task5','task6')").run();

const proj = db.prepare('SELECT id FROM Project LIMIT 1').get();
if (!proj) { console.log('no project'); process.exit(1); }
const pid = proj.id;

const tasks = [
  { id: 'task1', projectId: pid, wbsCode: '1.1', name: 'Project charter', phase: 'Initiation', baselineStart: '2025-01-06T00:00:00.000Z', baselineFinish: '2025-01-10T00:00:00.000Z', baselineDays: 5, percentComplete: 100, status: 'complete', sortOrder: 1 },
  { id: 'task2', projectId: pid, wbsCode: '1.2', name: 'Stakeholder analysis', phase: 'Initiation', baselineStart: '2025-01-13T00:00:00.000Z', baselineFinish: '2025-01-17T00:00:00.000Z', baselineDays: 5, percentComplete: 80, status: 'in_progress', sortOrder: 2 },
  { id: 'task3', projectId: pid, wbsCode: '1.3', name: 'Risk register setup', phase: 'Initiation', baselineStart: '2025-01-20T00:00:00.000Z', baselineFinish: '2025-01-22T00:00:00.000Z', baselineDays: 3, percentComplete: 0, status: 'not_started', sortOrder: 3 },
  { id: 'task4', projectId: pid, wbsCode: '2.1', name: 'Requirements gathering', phase: 'Planning', baselineStart: '2025-01-27T00:00:00.000Z', baselineFinish: '2025-02-07T00:00:00.000Z', baselineDays: 10, percentComplete: 60, status: 'in_progress', sortOrder: 4 },
  { id: 'task5', projectId: pid, wbsCode: '2.2', name: 'Solution design', phase: 'Planning', baselineStart: '2025-02-10T00:00:00.000Z', baselineFinish: '2025-02-21T00:00:00.000Z', baselineDays: 10, percentComplete: 0, status: 'not_started', sortOrder: 5 },
  { id: 'task6', projectId: pid, wbsCode: '3.1', name: 'Sprint 1 development', phase: 'Execution', baselineStart: '2025-02-24T00:00:00.000Z', baselineFinish: '2025-03-07T00:00:00.000Z', baselineDays: 10, percentComplete: 0, status: 'not_started', sortOrder: 6 },
];

const ins = db.prepare(
  "INSERT INTO ScheduleTask (id, projectId, wbsCode, name, phase, baselineStart, baselineFinish, baselineDays, percentComplete, status, sortOrder, dependencies, createdAt, updatedAt) VALUES (@id, @projectId, @wbsCode, @name, @phase, @baselineStart, @baselineFinish, @baselineDays, @percentComplete, @status, @sortOrder, '[]', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
);

tasks.forEach(t => ins.run(t));
console.log('Re-seeded', tasks.length, 'tasks for project', pid);
