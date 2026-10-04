const fs = require('fs');

const appJs = fs.readFileSync('js/app.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');

// Find all document.getElementById('...')
const idRegex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const usedIds = new Set();

while ((match = idRegex.exec(appJs)) !== null) {
  usedIds.add(match[1]);
}

console.log('Total document.getElementById IDs in app.js:', usedIds.size);

let missing = 0;
for (const id of usedIds) {
  // Check if ID is in index.html or created dynamically
  if (!indexHtml.includes(`id="${id}"`) && !indexHtml.includes(`id='${id}'`)) {
    // Check if it's created dynamically in app.js or another file
    if (!appJs.includes(`id: '${id}'`) && !appJs.includes(`id: "${id}"`)) {
      console.warn(`? ID '${id}' not found statically in index.html or created with id: '${id}'`);
      missing++;
    } else {
      console.log(`✓ ID '${id}' created dynamically in app.js`);
    }
  } else {
    // console.log(`✓ Found static ID: '${id}'`);
  }
}

if (missing === 0) {
  console.log('✓ ALL IDs accessed by app.js are present or created dynamically!');
} else {
  console.log(`Notice: ${missing} IDs might be optional/dynamic.`);
}
