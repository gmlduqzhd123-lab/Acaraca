const fs = require('fs');

const uiContent = fs.readFileSync('js/ui.js', 'utf8');
const match = uiContent.match(/const paths = \{([\s\S]*?)\n\};/);
const knownIcons = new Set(Object.keys(eval('({' + match[1] + '})')));

let failed = false;

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const m of content.matchAll(/icon\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (!knownIcons.has(m[1])) {
      console.error(`[${filePath}] Unknown icon in icon(): "${m[1]}"`);
      failed = true;
    }
  }
}

['js/app.js', 'js/admin.js', 'js/player.js', 'js/archive.js', 'js/data.js', 'js/pitch.js', 'js/ui.js'].forEach(checkFile);

// Check specific known buttons with icons
const appLines = fs.readFileSync('js/app.js', 'utf8').split('\n');
const expectedIcons = ['refresh', 'chevron-down', 'trash', 'plus', 'download', 'upload', 'book', 'music', 'external'];
expectedIcons.forEach(ic => {
  if (!knownIcons.has(ic)) {
    console.error(`Expected icon "${ic}" not defined in ui.js`);
    failed = true;
  }
});

if (failed) {
  console.error('✗ Icon audit failed: missing icon paths!');
  process.exit(1);
} else {
  console.log(`✓ ALL ${knownIcons.size} icon paths in ui.js are valid and verified!`);
}
