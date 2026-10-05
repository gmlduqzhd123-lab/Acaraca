const fs = require('fs');

let missingCount = 0;
function checkExists(label, p) {
  if (!p) return;
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:') || p.startsWith('#')) return;
  const cleanPath = p.replace(/^\.\//, '');
  if (!fs.existsSync(cleanPath)) {
    console.error('✗ MISSING FILE [' + label + ']:', cleanPath);
    missingCount++;
  }
}

// 1. Check sw.js CORE_ASSETS
const swCode = fs.readFileSync('sw.js', 'utf8');
const matchAssets = swCode.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
if (matchAssets) {
  const assets = eval('[' + matchAssets[1] + ']');
  assets.forEach(a => {
    if (a !== './') checkExists('sw.js asset', a);
  });
}

// 2. Check education.json
const edu = JSON.parse(fs.readFileSync('data/education.json', 'utf8'));
edu.resources.forEach(r => checkExists('edu fileUrl', r.fileUrl));

// 3. Check scores.json
const scores = JSON.parse(fs.readFileSync('data/scores.json', 'utf8'));
scores.scores.forEach(s => checkExists('score fileUrl', s.fileUrl));

// 4. Check memories.json
const memories = JSON.parse(fs.readFileSync('data/memories.json', 'utf8'));
memories.memories.forEach(m => {
  checkExists('memory mediaUrl', m.mediaUrl);
  checkExists('memory thumbnail', m.thumbnail);
});

// 5. Check index.html static tags
const html = fs.readFileSync('index.html', 'utf8');
const srcMatches = [...html.matchAll(/(?:src|href)="(\.[^"?]+)(?:\?[^"]*)?"/g)];
srcMatches.forEach(m => checkExists('index.html ref', m[1]));

// 6. Check nav icons
const navKeys = ['home', 'songs', 'appreciation', 'stage', 'scores', 'memories', 'rehearsal', 'practiceVideos', 'education', 'favorites', 'recent', 'settings'];
navKeys.forEach(k => checkExists('nav icon', './assets/icons/nav/' + k + '.png'));

// 7. Check rehearsals.json audio/video files
const rehearsals = JSON.parse(fs.readFileSync('data/rehearsals.json', 'utf8'));
rehearsals.rehearsals.forEach(r => {
  if (r.audio?.url) checkExists('rehearsal audioUrl', r.audio.url);
  if (r.video?.url) checkExists('rehearsal videoUrl', r.video.url);
});

if (missingCount === 0) {
  console.log('✓ ALL referenced local files exist on disk! No broken paths.');
} else {
  console.error('✗ Total missing files:', missingCount);
  process.exit(1);
}
