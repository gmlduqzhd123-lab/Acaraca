const fs = require('fs');

function checkDuplicateIds(filename) {
  const html = fs.readFileSync(filename, 'utf8');
  const idRegex = /\sid=["']([^"']+)["']/g;
  const ids = new Map();
  let match;
  let duplicates = 0;

  while ((match = idRegex.exec(html)) !== null) {
    const id = match[1];
    if (ids.has(id)) {
      console.error(`✗ [${filename}] Duplicate ID: '${id}'`);
      duplicates++;
    } else {
      ids.set(id, true);
    }
  }

  if (duplicates === 0) {
    console.log(`✓ [${filename}] All ${ids.size} IDs are completely unique!`);
  } else {
    console.error(`✗ [${filename}] Found ${duplicates} duplicate IDs.`);
  }
  return duplicates;
}

const d1 = checkDuplicateIds('index.html');
const d2 = checkDuplicateIds('admin.html');
if (d1 + d2 > 0) process.exit(1);
