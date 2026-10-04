const fs = require('fs');

function checkCssBraces(filename) {
  const css = fs.readFileSync(filename, 'utf8');
  let openBraces = 0;
  let line = 1;
  let errors = 0;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '\n') line++;
    if (ch === '{') openBraces++;
    else if (ch === '}') {
      openBraces--;
      if (openBraces < 0) {
        console.error(`✗ [${filename}] Unexpected closing brace '}' at line ${line}`);
        errors++;
        openBraces = 0;
      }
    }
  }

  if (openBraces > 0) {
    console.error(`✗ [${filename}] Unclosed braces remaining: ${openBraces}`);
    errors++;
  }

  if (errors === 0) {
    console.log(`✓ [${filename}] All braces are perfectly balanced!`);
  }
  return errors;
}

const e1 = checkCssBraces('css/style.css');
const e2 = checkCssBraces('css/admin.css');
if (e1 + e2 > 0) process.exit(1);
