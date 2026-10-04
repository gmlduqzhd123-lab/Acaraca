import fs from 'fs';
import zlib from 'zlib';

// Map NWC Pos to Note Name
// In Treble clef (G clef):
// Pos: 0 is B4.
// Step index: 0->B4, 1->C5, 2->D5, 3->E5, 4->F5, 5->G5, 6->A5, 7->B5
// -1->A4, -2->G4, -3->F4, -4->E4, -5->D4, -6->C4, -7->B3, -8->A3, -9->G3, -10->F3, -11->E3, -12->D3, -13->C3
const TREBLE_PITCH_MAP = {
  '-13': { letter: 'C', octave: 3 },
  '-12': { letter: 'D', octave: 3 },
  '-11': { letter: 'E', octave: 3 },
  '-10': { letter: 'F', octave: 3 },
  '-9':  { letter: 'G', octave: 3 },
  '-8':  { letter: 'A', octave: 3 },
  '-7':  { letter: 'B', octave: 3 },
  '-6':  { letter: 'C', octave: 4 },
  '-5':  { letter: 'D', octave: 4 },
  '-4':  { letter: 'E', octave: 4 },
  '-3':  { letter: 'F', octave: 4 },
  '-2':  { letter: 'G', octave: 4 },
  '-1':  { letter: 'A', octave: 4 },
  '0':   { letter: 'B', octave: 4 },
  '1':   { letter: 'C', octave: 5 },
  '2':   { letter: 'D', octave: 5 },
  '3':   { letter: 'E', octave: 5 },
  '4':   { letter: 'F', octave: 5 },
  '5':   { letter: 'G', octave: 5 },
  '6':   { letter: 'A', octave: 5 },
  '7':   { letter: 'B', octave: 5 },
  '8':   { letter: 'C', octave: 6 },
};

// In Bass clef (F clef):
// Pos: 0 is D3.
// 0->D3, 1->E3, 2->F3, 3->G3, 4->A3, 5->B3, 6->C4, 7->D4
// -1->C3, -2->B2, -3->A2, -4->G2, -5->F2, -6->E2, -7->D2, -8->C2
const BASS_PITCH_MAP = {
  '-8':  { letter: 'C', octave: 2 },
  '-7':  { letter: 'D', octave: 2 },
  '-6':  { letter: 'E', octave: 2 },
  '-5':  { letter: 'F', octave: 2 },
  '-4':  { letter: 'G', octave: 2 },
  '-3':  { letter: 'A', octave: 2 },
  '-2':  { letter: 'B', octave: 2 },
  '-1':  { letter: 'C', octave: 3 },
  '0':   { letter: 'D', octave: 3 },
  '1':   { letter: 'E', octave: 3 },
  '2':   { letter: 'F', octave: 3 },
  '3':   { letter: 'G', octave: 3 },
  '4':   { letter: 'A', octave: 3 },
  '5':   { letter: 'B', octave: 3 },
  '6':   { letter: 'C', octave: 4 },
  '7':   { letter: 'D', octave: 4 },
  '8':   { letter: 'E', octave: 4 },
};

function resolvePitch(posStr, clef, keySig) {
  let accidental = null;
  let cleanPos = posStr;
  if (posStr.startsWith('#')) { accidental = '#'; cleanPos = posStr.slice(1); }
  else if (posStr.startsWith('b')) { accidental = 'b'; cleanPos = posStr.slice(1); }
  else if (posStr.startsWith('n')) { accidental = ''; cleanPos = posStr.slice(1); }

  const map = clef === 'Bass' ? BASS_PITCH_MAP : TREBLE_PITCH_MAP;
  const base = map[cleanPos] || { letter: 'C', octave: clef === 'Bass' ? 3 : 4 };
  
  let noteLetter = base.letter;
  let finalAccidental = accidental;
  if (finalAccidental === null) {
    // Check key signature
    if (keySig.includes(noteLetter + '#')) finalAccidental = '#';
    else if (keySig.includes(noteLetter + 'b')) finalAccidental = 'b';
    else finalAccidental = '';
  }
  return `${noteLetter}${finalAccidental}${base.octave}`;
}

export function parseScores() {
  const dir = 'assets/scores';
  if (!fs.existsSync(dir)) return {};
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.nwc'));
  const results = {};

  for (const f of files) {
    try {
      const buf = fs.readFileSync(`${dir}/${f}`);
      const zStart = buf.indexOf(Buffer.from([0x78]));
      if (zStart < 0) continue;
      const decompressed = zlib.inflateSync(buf.slice(zStart)).toString('utf8');
      const lines = decompressed.split('\n').map(l => l.trim());
      
      const staves = [];
      let current = null;

      for (const line of lines) {
        if (line.startsWith('|AddStaff')) {
          const m = line.match(/Name:"([^"]*)"/);
          current = { name: m ? m[1] : `Staff ${staves.length + 1}`, clef: 'Treble', keySig: [], firstPitch: null, firstNoteLine: null };
          staves.push(current);
        } else if (line.startsWith('|Clef') && current) {
          const m = line.match(/Type:([A-Za-z]+)/);
          if (m) current.clef = m[1];
        } else if (line.startsWith('|Key') && current) {
          const m = line.match(/Signature:([A-Za-z0-9,#b]+)/);
          if (m) current.keySig = m[1].split(',');
        } else if (line.startsWith('|Note') && current && !current.firstPitch) {
          const m = line.match(/Pos:([#bns]?-?\d+)/);
          if (m) {
            current.firstPitch = resolvePitch(m[1], current.clef, current.keySig);
            current.firstNoteLine = line;
          }
        }
      }
      results[f] = staves;
    } catch (err) {
      results[f] = { error: err.message };
    }
  }
  return results;
}

const all = parseScores();
console.log(JSON.stringify(all, null, 2));
