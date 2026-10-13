// 각 NWC 악보에서 성부(스태프)별 첫 음이 나오는 시점을 계산해 등장 순서를 출력합니다.
// 사용법: node scripts/nwc-entry-order.cjs "파일명.nwc" [--json]
const fs = require('fs');
const zlib = require('zlib');

const BASE = { Whole: 1, Half: 0.5, '4th': 0.25, '8th': 0.125, '16th': 0.0625, '32nd': 0.03125, '64th': 0.015625 };

function durOf(spec, barLen) {
  const parts = spec.split(',');
  if (parts.includes('Grace')) return 0;
  let d = BASE[parts[0]];
  if (d === undefined) return 0;
  if (parts.includes('DblDotted')) d *= 1.75;
  else if (parts.includes('Dotted')) d *= 1.5;
  if (parts.includes('Triplet') || parts.some(p => p.startsWith('Triplet'))) d *= 2 / 3;
  return d;
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const CLEF_MID = { Treble: [6, 4], Bass: [1, 3], Alto: [0, 4], Tenor: [5, 3], Percussion: [1, 3] }; // 가운데 줄 [음이름 index, 옥타브]
function pitchOf(clef, octShift, keyAcc, acc, pos) {
  const [li, oct] = CLEF_MID[clef] || CLEF_MID.Treble;
  const step = li + pos;
  const letter = LETTERS[((step % 7) + 7) % 7];
  const octave = oct + Math.floor(step / 7) + octShift;
  const map = { '#': '#', b: 'b', n: '', x: '##', v: 'bb' };
  const a = acc ? map[acc] : (keyAcc[letter] || '');
  return `${letter}${a}${octave}`;
}

function analyze(filePath) {
  const buf = fs.readFileSync(filePath);
  const zStart = buf.indexOf(Buffer.from([0x78]));
  const text = zlib.inflateSync(buf.slice(zStart)).toString('utf8');
  const staves = text.split('|AddStaff').slice(1);
  return staves.map((s, i) => {
    const name = s.match(/Name:"([^"]*)"/)?.[1] || `staff${i + 1}`;
    let t = 0;
    let barLen = 1;
    let barStart = 0;
    let first = null;
    let firstPitch = null;
    let clef = 'Treble';
    let octShift = 0;
    let keyAcc = {};
    for (const line of s.split(/\r?\n/)) {
      const sig = line.match(/^\|TimeSig\|Signature:(\d+)\/(\d+)/);
      if (sig) { barLen = Number(sig[1]) / Number(sig[2]); continue; }
      if (/^\|TimeSig\|Signature:(Common|AllaBreve)/.test(line)) { barLen = 1; continue; }
      const c = line.match(/^\|Clef\|Type:(\w+)/);
      if (c) { clef = c[1]; octShift = /Octave Down/.test(line) ? -1 : /Octave Up/.test(line) ? 1 : 0; continue; }
      const k = line.match(/^\|Key\|Signature:([^|]*)/);
      if (k) { keyAcc = {}; k[1].split(',').forEach(a => { if (a[0] && a[0] !== 'C' || a.length > 1) keyAcc[a[0]] = a[1] || ''; }); continue; }
      if (line.startsWith('|Bar')) { barStart = t; continue; }
      const mbr = line.match(/^\|RestMultiBar\|NumBars:(\d+)/);
      if (mbr) { t += Number(mbr[1]) * barLen; barStart = t; continue; }
      const m = line.match(/^\|(Rest|Note|Chord|RestChord)\|Dur:([^|]+)/);
      if (!m) continue;
      if (m[1] === 'Note' || m[1] === 'Chord' || m[1] === 'RestChord') {
        first = t;
        const pm = line.match(/Pos:([#bnxv]?)(-?\d+)/);
        if (pm) firstPitch = pitchOf(clef, octShift, keyAcc, pm[1], Number(pm[2]));
        break;
      }
      // 마디 전체 쉼표(Whole)는 박자표 길이만큼으로 간주
      t += m[2].startsWith('Whole') && !m[2].includes('Dotted') ? barLen : durOf(m[2], barLen);
    }
    return { index: i + 1, name, firstNoteAt: first, firstPitch };
  });
}

const file = process.argv[2];
const res = analyze(file.includes('/') ? file : `assets/scores/${file}`);
if (process.argv.includes('--json')) console.log(JSON.stringify(res));
else res.forEach(r => console.log(`${r.index}\t${r.firstNoteAt}\t${r.firstPitch}\t${r.name}`));
