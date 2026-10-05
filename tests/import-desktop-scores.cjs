const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getHash(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (e) {
    return null;
  }
}

function scan(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results = results.concat(scan(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const scoresJsonPath = path.resolve('data/scores.json');
const scoresData = JSON.parse(fs.readFileSync(scoresJsonPath, 'utf8'));

const existingHashes = new Set();
scoresData.scores.forEach(s => {
  if (s.fileUrl) {
    const clean = s.fileUrl.replace(/^\.\//, '');
    if (fs.existsSync(clean)) {
      const h = getHash(clean);
      if (h) existingHashes.add(h);
    }
  }
});

const excludedPdfs = new Set([
  '「2025 아고라 순천 참가신청」 아카라카.pdf',
  '김명현-주민등록표 초본.pdf',
  '김용석-주민등록표 초본.pdf',
  '김현-주민등록표 초본.pdf',
  '문선영-주민등록표 초본.pdf',
  '순천문화재단 생활문화동호회 등록 신청서 (아카라카).pdf',
  '아카라카 신분증 통장사본.pdf',
  '위임장 및 출연료정보서식(아카라카).pdf',
  '이종미-주민등록표 초본.pdf',
  '임휘소-주민등록표 초본.pdf',
  '조혜령-주민등록표 초본.pdf',
  '[참가신청서] 2026_문화의달_전국생활문화동호인_참가신청서(공연).pdf',
  '문화의달 물결스테이지_아카라카.pdf'
]);

const skipNames = new Set([
  '아로하.nwc',
  'butterfly.nwc',
  '타요 뽀로로.nwc'
]);

const validExts = new Set(['.nwc', '.pdf', '.mid', '.nwctxt']);
const desktopRoot = 'C:\\Users\\user\\Desktop\\아카펠라';
const allDesktop = scan(desktopRoot);

const candidates = allDesktop.filter(f => {
  const ext = path.extname(f).toLowerCase();
  if (!validExts.has(ext)) return false;
  if (excludedPdfs.has(path.basename(f))) return false;
  return true;
});

const seenHashes = new Set();
const toImport = [];

candidates.forEach(f => {
  const h = getHash(f);
  const baseLow = path.basename(f).toLowerCase();
  if (existingHashes.has(h) || skipNames.has(baseLow) || seenHashes.has(h)) return;
  seenHashes.add(h);
  toImport.push(f);
});

console.log(`Found ${toImport.length} unique new score files to import.`);

// Songs mapping table
const songMatchMap = [
  { match: /무조건/i, id: 'mujogeon' },
  { match: /단발머리/i, id: 'short-hair' },
  { match: /디즈니/i, id: 'disney-medley' },
  { match: /첫인상/i, id: 'first-impression' },
  { match: /담배가게/i, id: 'tobacco-shop-girl' },
  { match: /아로하/i, id: 'aloha' },
  { match: /타요.*뽀로로|뽀로로.*타요/i, id: 'tayo-pororo' },
  { match: /하늘을.*달리다/i, id: 'run-the-sky' },
  { match: /아카라카.*소개/i, id: 'acaroom-opening' },
  { match: /speechless/i, id: 'speechless' },
  { match: /그대.*내.*품에/i, id: 'in-your-arms' },
  { match: /행복한.*학교/i, id: 'happy-school' },
  { match: /학교.*가자/i, id: 'go-to-school' },
  { match: /수고했어.*오늘도/i, id: 'well-done-today' },
  { match: /보헤미안.*랩소디|bohemian/i, id: 'bohemian-rhapsody' },
  { match: /단소리/i, id: 'dansori' },
  { match: /isn'?t.*she.*lovely/i, id: 'isnt-she-lovely' },
  { match: /여행을.*떠나요/i, id: 'lets-travel' },
  { match: /l\.?o\.?v\.?e/i, id: 'l-o-v-e' },
  { match: /아름다운.*세상/i, id: 'beautiful-world' },
  { match: /butterfly/i, id: 'butterfly' },
  { match: /벚꽃.*엔딩/i, id: 'cherry-blossom-ending' },
  { match: /사랑해.*사랑해/i, id: 'love-love' },
  { match: /white.*christmas|화이트.*크리스마스|캐롤.*메들리/i, id: 'carol-medley' },
  { match: /ditto|디토/i, id: 'ditto' },
];

function findSongId(text) {
  for (const item of songMatchMap) {
    if (item.match.test(text)) return item.id;
  }
  return null;
}

const targetBaseDir = path.resolve('assets/scores/archive');

const newScoreRecords = [];

toImport.forEach((srcPath, idx) => {
  const rel = path.relative(desktopRoot, srcPath);
  const destPath = path.join(targetBaseDir, rel);
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copy file
  fs.copyFileSync(srcPath, destPath);

  const base = path.basename(srcPath);
  const ext = path.extname(srcPath).toLowerCase().replace('.', '');
  const nameNoExt = path.basename(srcPath, path.extname(srcPath));
  const stat = fs.statSync(destPath);

  // Classify Team
  let team = '아카라카';
  if (rel.includes('남성팀') || base.includes('남성') || base.includes('남자')) team = '남성팀';
  else if (rel.includes('혼성팀') || base.includes('혼성')) team = '혼성팀';
  else if (rel.includes('연구회') || rel.includes('전남초등아카펠라교육연구회')) team = '연구회';

  // Classify Category
  let category = '가요';
  const checkText = (rel + ' ' + base).toLowerCase();
  if (checkText.includes('캐롤') || checkText.includes('christmas') || checkText.includes('jingle') || checkText.includes('rudolph') || checkText.includes('오홀리나잇') || checkText.includes('white christmas') || checkText.includes('silentnight') || checkText.includes('carol')) {
    category = '캐롤';
  } else if (checkText.includes('ost') || checkText.includes('알라딘') || checkText.includes('센과 치이로') || checkText.includes('디즈니') || checkText.includes('라이언킹') || checkText.includes('lion') || checkText.includes('trolls')) {
    category = 'OST';
  } else if (checkText.includes('동요') || checkText.includes('뽀로로') || checkText.includes('타요') || checkText.includes('도레미송') || checkText.includes('섬집아기') || checkText.includes('아기 염소') || checkText.includes('올챙이') || checkText.includes('작은 동물원') || checkText.includes('비행기') || checkText.includes('국민체조')) {
    category = '동요';
  } else if (checkText.includes('pop') || checkText.includes('beatles') || checkText.includes('real group') || checkText.includes('she lovely') || checkText.includes('sunshine') || checkText.includes('rainbow') || checkText.includes('walking') || checkText.includes('eyes off you') || checkText.includes('cant take') || checkText.includes('dancing_queen') || checkText.includes('young') || checkText.includes('newjeans')) {
    category = 'POP';
  } else if (checkText.includes('클래식') || checkText.includes('dido') || checkText.includes('lament') || checkText.includes('아리랑') || checkText.includes('뱃노래') || checkText.includes('dobbin')) {
    category = '클래식';
  } else if (checkText.includes('창작') || checkText.includes('소개') || checkText.includes('이솝') || checkText.includes('행복한 학교') || checkText.includes('학교가자')) {
    category = '창작';
  } else if (checkText.includes('페스티벌') || checkText.includes('글로컬')) {
    category = '페스티벌';
  }

  // Classify Part
  let part = 'all';
  if (/소프라노|soprano/i.test(base)) part = 'soprano';
  else if (/알토|alto/i.test(base)) part = 'alto';
  else if (/테너|tenor/i.test(base)) part = 'tenor';
  else if (/바리톤|baritone/i.test(base)) part = 'baritone';
  else if (/베이스|bass/i.test(base)) part = 'bass';
  else if (/퍼커션|vp|percussion/i.test(base)) part = 'vp';
  else if (/리드|lead/i.test(base)) part = 'lead';

  // Extract year
  let year = '';
  const yrMatch = base.match(/(?:20|19)?(1[4-9]|2[0-6])(?=[0-1][0-9][0-3][0-9])/); // YYMMDD format like 160728, 201029
  if (yrMatch) {
    year = '20' + yrMatch[1];
  } else {
    const fullYrMatch = base.match(/(20[1-2][0-9])/);
    if (fullYrMatch) year = fullYrMatch[1];
  }

  // Clean Title
  let title = nameNoExt
    .replace(/^TalkFile_/, '')
    .replace(/\.nwc$/, '')
    .replace(/arr\s*[^.]+$/i, '')
    .trim();

  // Extract Arranger
  let arranger = '아카라카';
  const arrMatch = nameNoExt.match(/arr\s*([가-힣a-zA-Z\s]+)/i);
  if (arrMatch) {
    arranger = arrMatch[1].trim();
  } else if (base.includes('Maytree') || base.includes('메이트리')) {
    arranger = 'Maytree';
  } else if (base.includes('EXIT') || base.includes('엑시트')) {
    arranger = 'EXIT';
  } else if (base.includes('The Present')) {
    arranger = 'The Present';
  } else if (base.includes('다이아')) {
    arranger = '다이아 (D.I.A)';
  } else if (base.includes('스윙글싱어즈')) {
    arranger = '스윙글 싱어즈';
  }

  const songId = findSongId(base + ' ' + title);

  const posixUrl = './' + path.relative('.', destPath).replace(/\\/g, '/');

  newScoreRecords.push({
    id: `score-desk-${String(idx + 1).padStart(3, '0')}`,
    songId: songId || null,
    title: title,
    team: team,
    category: category,
    part: part,
    format: ext === 'mid' ? 'midi' : ext,
    fileType: ext === 'mid' ? 'midi' : ext,
    fileName: base,
    fileSize: formatBytes(stat.size),
    fileUrl: posixUrl,
    year: year || '2024',
    arranger: arranger,
    memo: `아카라카 아카이브 (${path.dirname(rel).replace(/\\/g, ' / ') || '루트'}) 악보 자료`
  });
});

scoresData.version = 5;
scoresData.scores = [...scoresData.scores, ...newScoreRecords];

fs.writeFileSync(scoresJsonPath, JSON.stringify(scoresData, null, 2), 'utf8');

console.log(`Successfully imported ${newScoreRecords.length} scores. Total scores in registry: ${scoresData.scores.length}`);
