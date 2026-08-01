// Increments fontSize by 1 in the specified tab sections of workspace-client.tsx
const fs = require('fs');

const filePath = require('path').join(__dirname, '..', 'src', 'components', 'workspace-client.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// 1-indexed line ranges (inclusive) for: Risk, Issues, Schedule, Resources, Status/WSR, Cost
const RANGES = [
  [376, 674],
  [675, 1123],
  [1124, 2045],
  [2046, 2231],
  [2617, 2797],
  [2798, Infinity],
];

function inRange(n) {
  return RANGES.some(([s, e]) => n >= s && n <= e);
}

function bumpFontSizes(line) {
  return line.replace(/fontSize:\s*(\d+(?:\.\d+)?)/g, (_, num) => {
    const next = Math.round((parseFloat(num) + 1) * 10) / 10;
    return `fontSize: ${next % 1 === 0 ? next.toFixed(0) : next}`;
  });
}

let changed = 0;
const newLines = lines.map((line, i) => {
  const lineNum = i + 1;
  if (inRange(lineNum) && /fontSize/.test(line)) {
    const updated = bumpFontSizes(line);
    if (updated !== line) changed++;
    return updated;
  }
  return line;
});

fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
console.log(`Done — bumped fontSize on ${changed} lines across 6 tabs.`);
