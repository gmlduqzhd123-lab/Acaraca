const fs = require('fs');
const zlib = require('zlib');

const targetFile = process.argv[2] || 'Butterfly.nwc';
let filePath = `assets/scores/${targetFile}`;

if (!fs.existsSync(filePath)) {
  // Try searching in subdirs
  function findFile(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = dir + '/' + e.name;
      if (e.isDirectory()) {
        const found = findFile(full);
        if (found) return found;
      } else if (e.name === targetFile) {
        return full;
      }
    }
    return null;
  }
  const found = findFile('assets/scores');
  if (found) filePath = found;
  else {
    console.error('File not found:', targetFile);
    process.exit(1);
  }
}

const buf = fs.readFileSync(filePath);
const zStart = buf.indexOf(Buffer.from([0x78]));
if (zStart < 0) {
  console.error('Not a valid NWC/NWZ compressed file');
  process.exit(1);
}
const decompressed = zlib.inflateSync(buf.slice(zStart)).toString('utf8');

const staves = decompressed.split('|AddStaff').slice(1);
console.log(`=== ${targetFile} (${staves.length} staves) ===`);
staves.forEach(s => {
  const name = s.match(/Name:"([^"]*)"/)?.[1];
  const clef = s.match(/\|Clef\|[^\r\n]*/)?.[0];
  const key = s.match(/\|Key\|[^\r\n]*/)?.[0];
  const lyrics = s.match(/\|Lyric1\|Text:"([^"]*)"/)?.[1];
  const notes = s.split('\n').filter(l => l.startsWith('|Note')).slice(0, 4);
  console.log('\nStaff:', name);
  console.log('  Clef:', clef);
  console.log('  Key:', key);
  if (lyrics) console.log('  Lyrics:', lyrics.replace(/\\n/g, ' ').slice(0, 60));
  console.log('  Notes:');
  notes.forEach(n => console.log('   ', n.trim()));
});
