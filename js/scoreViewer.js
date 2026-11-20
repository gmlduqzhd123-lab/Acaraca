/**
 * AcaRaca 악보 미리보기 (NWC·MIDI·MuseScore·PDF)
 * - 악보 파일을 읽어 오선보·파트 첫 음·연습 재생기를 보여 주는 팝업.
 * - 악보를 열 때만 필요하므로 app.js가 처음 악보를 열 때 불러온다.
 */
import { PARTS } from './data.js';
import { formatPlayerTime } from './player.js';
import { el, button, toast } from './ui.js';
import { stopPitch, parseNoteString, transposeNoteString, transposeMusicalKey, playNoteString, playChordStrings, playPitchSequence, createMultiTrackScorePlayer } from './pitch.js';
import { getScoresForSong } from './archive.js';
import { getScoreFormatKey } from './practiceLogic.js';

// app.js에 있는 화면 상태·이동 도우미는 처음 불러올 때 bindApp으로 넘겨받는다.
let state, getSongTranspose, formatTransposeBadgeText, openSong, openOrDownloadScore, openPitchPipe;
export function bindApp(ctx) {
  ({ state, getSongTranspose, formatTransposeBadgeText, openSong, openOrDownloadScore, openPitchPipe } = ctx);
}

function decodeSmartBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(u8);
  let euckr = utf8;
  try {
    euckr = new TextDecoder('euc-kr', { fatal: false }).decode(u8);
  } catch {}
  const scoreText = (s) => (s.match(/[가-힣]/g) || []).length * 3 - (s.match(/\ufffd/g) || []).length * 5;
  return scoreText(euckr) > scoreText(utf8) ? euckr : utf8;
}

const SCORE_CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCORE_CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function parseNwctxtScoreDetail(text, fallbackTitle = '') {
  const lines = String(text || '').split(/\r?\n/);
  let title = fallbackTitle;
  let author = '';
  let globalTempo = null;
  let globalTimeSig = '4/4';
  let globalBarBeats = 4;

  for (const line of lines) {
    if (!globalTempo && line.startsWith('|Tempo|')) {
      const bMatch = line.match(/Tempo:(\d+)/);
      if (bMatch) globalTempo = Number(bMatch[1]);
    }
    if (globalTimeSig === '4/4' && line.startsWith('|TimeSig|')) {
      const sMatch = line.match(/Signature:(\d+)\/(\d+)/);
      if (sMatch) {
        globalTimeSig = `${sMatch[1]}/${sMatch[2]}`;
        globalBarBeats = (Number(sMatch[1]) * 4) / Number(sMatch[2]);
      } else if (/Signature:AllaBreve/.test(line)) {
        globalTimeSig = '2/2';
        globalBarBeats = 4;
      }
    }
  }

  const NWC_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const CENTER_STEPS = {
    Treble: 6 + 4 * 7,
    Bass: 1 + 3 * 7,
    Alto: 0 + 4 * 7,
    Tenor: 5 + 3 * 7,
    Percussion: 1 + 3 * 7
  };
  const MAJOR_FLATS = { 1: 'F Major', 2: 'Bb Major', 3: 'Eb Major', 4: 'Ab Major', 5: 'Db Major', 6: 'Gb Major', 7: 'Cb Major' };
  const MAJOR_SHARPS = { 1: 'G Major', 2: 'D Major', 3: 'A Major', 4: 'E Major', 5: 'B Major', 6: 'F# Major', 7: 'C# Major' };
  const BASE_BEATS = { Whole: 4, Half: 2, '4th': 1, '8th': 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };

  const parseDurBeats = (durSpec, barBeats, isRest = false) => {
    const parts = String(durSpec || '').split(',');
    if (parts.includes('Grace')) return 0;
    if (isRest && parts[0] === 'Whole' && !parts.includes('Dotted') && !parts.includes('DblDotted')) {
      return barBeats;
    }
    let b = BASE_BEATS[parts[0]];
    if (b === undefined) return 0;
    if (parts.includes('DblDotted')) b *= 1.75;
    else if (parts.includes('Dotted')) b *= 1.5;
    if (parts.some(p => p.startsWith('Triplet'))) b *= 2 / 3;
    return b;
  };

  const resolvePosToken = (tok, clefName, octShift, keyAcc, barAcc, preferFlats) => {
    const m = String(tok || '').trim().match(/^([#bnxv]?)(-?\d+)/);
    if (!m) return null;
    const accChar = m[1];
    const posVal = Number(m[2]);
    if (!Number.isFinite(posVal) || Math.abs(posVal) > 28) return null;
    const baseStep = CENTER_STEPS[clefName] ?? CENTER_STEPS.Treble;
    const totalSteps = baseStep + posVal + octShift * 7;
    const letter = NWC_LETTERS[((totalSteps % 7) + 7) % 7];
    let oct = Math.floor(totalSteps / 7);
    let delta = 0;
    let useFlat = preferFlats;
    if (accChar) {
      delta = accChar === '#' ? 1 : accChar === 'b' ? -1 : accChar === 'x' ? 2 : accChar === 'v' ? -2 : 0;
      barAcc[letter] = delta;
      if (accChar === 'b' || accChar === 'v') useFlat = true;
      else if (accChar === '#' || accChar === 'x') useFlat = false;
    } else if (barAcc[letter] !== undefined) {
      delta = barAcc[letter];
      if (delta < 0) useFlat = true;
      else if (delta > 0) useFlat = false;
    } else {
      delta = keyAcc[letter] || 0;
      if (delta < 0) useFlat = true;
      else if (delta > 0) useFlat = false;
    }
    let semi = SEMI[letter] + delta;
    while (semi < 0) { semi += 12; oct -= 1; }
    while (semi >= 12) { semi -= 12; oct += 1; }
    const scale = useFlat ? SCORE_CHROMATIC_FLAT : SCORE_CHROMATIC_SHARP;
    return {
      pitch: `${scale[semi]}${oct}`,
      tieOut: String(tok).includes('^')
    };
  };

  const staves = [];
  let currentStaff = null;
  let stState = null;

  for (const line of lines) {
    if (line.startsWith('|SongInfo|')) {
      const tMatch = line.match(/Title:"([^"]*)"/);
      const aMatch = line.match(/Author:"([^"]*)"/);
      if (tMatch && tMatch[1]) title = tMatch[1];
      if (aMatch && aMatch[1]) author = aMatch[1];
    } else if (line.startsWith('|AddStaff|')) {
      const nameMatch = line.match(/Name:"([^"]*)"/);
      const labelMatch = line.match(/Label:"([^"]*)"/);
      const rawName = (nameMatch && nameMatch[1]) || '';
      const rawLabel = (labelMatch && labelMatch[1]) || '';
      const displayName = rawLabel || rawName || `Staff ${staves.length + 1}`;
      currentStaff = {
        name: displayName,
        subName: rawName && rawName !== displayName ? rawName : '',
        clef: 'Treble',
        keySig: 'C Major',
        timeSig: globalTimeSig,
        tempo: null,
        firstNote: null,
        melodyNotes: [],
        timedNotes: [],
        lyrics: ''
      };
      stState = {
        clefType: 'Treble',
        octShift: 0,
        keyAcc: {},
        barAcc: {},
        preferFlats: false,
        barBeats: globalBarBeats,
        bpm: globalTempo || 108,
        timeSec: 0,
        activeTies: {},
        isPerc: /percussion|drum|vp|beatbox/i.test(displayName)
      };
      staves.push(currentStaff);
    } else if (currentStaff && line.startsWith('|StaffProperties|')) {
      if (/Channel:10\b/.test(line)) stState.isPerc = true;
    } else if (currentStaff && line.startsWith('|Lyric1|')) {
      const lMatch = line.match(/Text:"([^"]*)"/);
      if (lMatch && lMatch[1] && !currentStaff.lyrics) {
        currentStaff.lyrics = lMatch[1].replace(/\\r\\n|\\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      }
    } else if (currentStaff && line.startsWith('|Clef|')) {
      const cMatch = line.match(/Type:([A-Za-z]+)/);
      if (cMatch) {
        stState.clefType = cMatch[1];
        if (cMatch[1] === 'Percussion') stState.isPerc = true;
      }
      stState.octShift = /OctaveShift:Octave Down/.test(line) ? -1 : /OctaveShift:Octave Up/.test(line) ? 1 : 0;
      currentStaff.clef = stState.clefType + (stState.octShift === -1 ? ' 8vb' : stState.octShift === 1 ? ' 8va' : '');
    } else if (currentStaff && line.startsWith('|Key|')) {
      const kMatch = line.match(/Signature:([^|]+)/);
      if (kMatch) {
        stState.keyAcc = {};
        let flats = 0;
        let sharps = 0;
        kMatch[1].split(',').forEach(tok => {
          const t = tok.trim();
          if (t.length >= 2 && (t[1] === 'b' || t[1] === '#')) {
            stState.keyAcc[t[0]] = t[1] === 'b' ? -1 : 1;
            if (t[1] === 'b') flats++;
            else sharps++;
          }
        });
        stState.preferFlats = flats > 0;
        currentStaff.keySig = MAJOR_FLATS[flats] || MAJOR_SHARPS[sharps] || 'C Major';
      }
    } else if (currentStaff && line.startsWith('|TimeSig|')) {
      const sMatch = line.match(/Signature:(\d+)\/(\d+)/);
      if (sMatch) {
        currentStaff.timeSig = `${sMatch[1]}/${sMatch[2]}`;
        stState.barBeats = (Number(sMatch[1]) * 4) / Number(sMatch[2]);
      } else if (/Signature:Common/.test(line)) {
        currentStaff.timeSig = '4/4';
        stState.barBeats = 4;
      } else if (/Signature:AllaBreve/.test(line)) {
        currentStaff.timeSig = '2/2';
        stState.barBeats = 4;
      }
    } else if (currentStaff && line.startsWith('|Tempo|')) {
      const bMatch = line.match(/Tempo:(\d+)/);
      if (bMatch) {
        const bpmVal = Number(bMatch[1]);
        if (bpmVal >= 30 && bpmVal <= 280) {
          if (!currentStaff.tempo) currentStaff.tempo = bpmVal;
          stState.bpm = bpmVal;
        }
      }
    } else if (currentStaff && (line === '|Bar' || line.startsWith('|Bar|'))) {
      stState.barAcc = {};
    } else if (currentStaff && line.startsWith('|RestMultiBar|')) {
      const mMatch = line.match(/NumBars:(\d+)/);
      if (mMatch) {
        stState.timeSec += (Number(mMatch[1]) * stState.barBeats * 60) / stState.bpm;
      }
    } else if (currentStaff && line.startsWith('|Rest|')) {
      const dMatch = line.match(/Dur:([^|]+)/);
      if (dMatch) {
        const beats = parseDurBeats(dMatch[1], stState.barBeats, true);
        stState.timeSec += (beats * 60) / stState.bpm;
      }
    } else if (currentStaff && !stState.isPerc && (line.startsWith('|Note|') || line.startsWith('|Chord|') || line.startsWith('|RestChord|'))) {
      const dMatch = line.match(/Dur:([^|]+)/);
      const beats = dMatch ? parseDurBeats(dMatch[1], stState.barBeats, false) : 0;
      const posMatch = line.match(/\|Pos:([^|]+)/) || line.match(/\|Pos2:([^|]+)/);
      if (posMatch && beats > 0) {
        const tokens = posMatch[1].split(',').slice(0, 4);
        const resolved = tokens
          .map(t => resolvePosToken(t, stState.clefType, stState.octShift, stState.keyAcc, stState.barAcc, stState.preferFlats))
          .filter(Boolean);
        const durSec = (beats * 60) / stState.bpm;

        if (resolved.length) {
          const topItem = resolved[resolved.length - 1];
          const wasTiedIn = stState.activeTies[topItem.pitch] !== undefined;
          if (!currentStaff.firstNote) currentStaff.firstNote = topItem.pitch;
          if (!wasTiedIn && currentStaff.melodyNotes.length < 16) {
            currentStaff.melodyNotes.push(topItem.pitch);
          }

          if (currentStaff.timedNotes.length < 480) {
            for (const item of resolved) {
              const tieIdx = stState.activeTies[item.pitch];
              if (tieIdx !== undefined && currentStaff.timedNotes[tieIdx]) {
                currentStaff.timedNotes[tieIdx].durSec = Number((currentStaff.timedNotes[tieIdx].durSec + durSec).toFixed(4));
                if (!item.tieOut) delete stState.activeTies[item.pitch];
              } else {
                currentStaff.timedNotes.push({
                  note: item.pitch,
                  startSec: Number(stState.timeSec.toFixed(4)),
                  durSec: Number(Math.max(0.06, durSec * 0.96).toFixed(4))
                });
                if (item.tieOut) {
                  stState.activeTies[item.pitch] = currentStaff.timedNotes.length - 1;
                }
              }
            }
          }
        }
        stState.timeSec += durSec;
      }
    }
  }

  const effectiveKey = staves.find(s => s.keySig && s.keySig !== 'C Major')?.keySig || staves[0]?.keySig || 'C Major';
  return {
    format: 'NWCTXT',
    title,
    author,
    musicalKey: effectiveKey,
    timeSig: staves[0]?.timeSig || globalTimeSig,
    tempo: globalTempo || staves.find(s => s.tempo)?.tempo || null,
    staves
  };
}

async function parseNwcScoreDetail(buffer, fallbackTitle = '') {
  let u8 = new Uint8Array(buffer);
  const headerStr = new TextDecoder('ascii').decode(u8.slice(0, 24));
  if (headerStr.startsWith('!NoteWorthy')) {
    return parseNwctxtScoreDetail(decodeSmartBytes(u8), fallbackTitle);
  }

  let zStart = -1;
  if (headerStr.startsWith('[NWZ]')) {
    zStart = 6;
  } else {
    for (let i = 0; i < Math.min(u8.length - 2, 64); i++) {
      if (u8[i] === 0x78 && (u8[i + 1] === 0x01 || u8[i + 1] === 0x5e || u8[i + 1] === 0x9c || u8[i + 1] === 0xda)) {
        zStart = i;
        break;
      }
    }
  }

  if (zStart >= 0 && typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([u8.slice(zStart)]).stream().pipeThrough(new DecompressionStream('deflate'));
    u8 = new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // NWC 2.75 파일은 압축 해제 후 내부에 !NoteWorthyComposer 텍스트 스트림을 포함함
  const smartDecoded = decodeSmartBytes(u8);
  const nwctxtIdx = smartDecoded.indexOf('!NoteWorthyComposer');
  if (nwctxtIdx >= 0) {
    const res = parseNwctxtScoreDetail(smartDecoded.slice(nwctxtIdx), fallbackTitle);
    res.format = 'NWC';
    return res;
  }
  if (smartDecoded.includes('|AddStaff|')) {
    const res = parseNwctxtScoreDetail(smartDecoded, fallbackTitle);
    res.format = 'NWC';
    return res;
  }

  // Binary NWC (v1.70 ~ v2.05) 파서 — 전 10종 스태프 그룹 마커 스캔
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const NWC_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const KEY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const CLEF_NAMES = { 0: 'Treble', 1: 'Bass', 2: 'Alto', 3: 'Tenor' };
  const CENTER_STEPS = { 0: 6 + 4 * 7, 1: 1 + 3 * 7, 2: 0 + 4 * 7, 3: 5 + 3 * 7 };
  const MAJOR_KEYS_BY_FLATS = { 0: 'C Major', 1: 'F Major', 2: 'Bb Major', 3: 'Eb Major', 4: 'Ab Major', 5: 'Db Major', 6: 'Gb Major', 7: 'Cb Major' };
  const MAJOR_KEYS_BY_SHARPS = { 0: 'C Major', 1: 'G Major', 2: 'D Major', 3: 'A Major', 4: 'E Major', 5: 'B Major', 6: 'F# Major', 7: 'C# Major' };
  const GROUPS = ['Standard\0', 'Vocal\0', 'Orch\0', 'Custom\0', 'Winds\0', 'Brass\0', 'Strings\0', 'Choir\0', 'Percussion\0', 'Piano\0'];

  const groupHits = [];
  for (let i = 20; i < u8.length - 12; i++) {
    for (const g of GROUPS) {
      let ok = true;
      for (let k = 0; k < g.length; k++) {
        if (u8[i + k] !== g.charCodeAt(k)) { ok = false; break; }
      }
      if (ok && u8[i - 1] === 0) {
        const prevStrings = [];
        let p = i - 1;
        for (let sIdx = 0; sIdx < 3 && p > 4; sIdx++) {
          let start = p - 1;
          while (start > 0 && p - 1 - start < 64 && u8[start] >= 0x20) start--;
          if (u8[start] === 0 || start === 0) {
            const rawSlice = u8.slice(start + 1, p);
            if (rawSlice.length > 0) prevStrings.unshift(decodeSmartBytes(rawSlice).trim());
            p = start;
          } else break;
        }
        const rawName = prevStrings[0] || '';
        const rawLabel = prevStrings[1] || '';
        groupHits.push({
          pos: i,
          end: i + g.length,
          group: g.slice(0, -1),
          rawName,
          rawLabel
        });
        i += g.length - 1;
        break;
      }
    }
  }

  let globalTempo = null;
  let globalKey = 'C Major';
  let globalTimeSig = '4/4';

  // 1차 패스: 전체 스태프에서 초기 템포(0x06) 스캔
  for (let sIdx = 0; sIdx < groupHits.length && !globalTempo; sIdx++) {
    const cur = groupHits[sIdx];
    const nextPos = sIdx + 1 < groupHits.length ? Math.max(cur.end, groupHits[sIdx + 1].pos - 48) : u8.length;
    const slice = u8.slice(cur.end + 24, nextPos);
    let started = false;
    for (let i = 0; i < slice.length - 10; i++) {
      const op = slice[i];
      if (!started) {
        if ((op === 0x00 || op === 0x01 || op === 0x05) && slice[i + 1] === 0 && slice[i + 2] === 0) started = true;
        else continue;
      }
      if (op === 0x06 && slice[i + 1] === 0 && slice[i + 2] === 0 && i + 8 < slice.length) {
        const bpm = slice[i + 5] | (slice[i + 6] << 8);
        if (bpm >= 35 && bpm <= 250) {
          globalTempo = bpm;
          break;
        }
      }
    }
  }

  const getPitchAtBinaryPos = (clefType, octShift, posVal, keyFlats, keySharps, barAcc, accCode) => {
    const totalSteps = (CENTER_STEPS[clefType] ?? CENTER_STEPS[0]) - posVal;
    const letter = NWC_LETTERS[((totalSteps % 7) + 7) % 7];
    let octave = Math.floor(totalSteps / 7) + (octShift === 1 ? 1 : octShift === 2 ? -1 : 0);
    let delta = 0;
    let useFlat = keyFlats.length > 0;
    if (accCode === 0) { delta = 1; barAcc[letter] = 1; useFlat = false; }
    else if (accCode === 1) { delta = -1; barAcc[letter] = -1; useFlat = true; }
    else if (accCode === 2) { delta = 0; barAcc[letter] = 0; }
    else if (accCode === 3) { delta = 2; barAcc[letter] = 2; useFlat = false; }
    else if (accCode === 4) { delta = -2; barAcc[letter] = -2; useFlat = true; }
    else if (barAcc[letter] !== undefined) {
      delta = barAcc[letter];
      if (delta < 0) useFlat = true;
      else if (delta > 0) useFlat = false;
    } else {
      if (keyFlats.includes(letter)) { delta = -1; useFlat = true; }
      else if (keySharps.includes(letter)) { delta = 1; useFlat = false; }
    }
    let semitone = SEMI[letter] + delta;
    while (semitone < 0) { semitone += 12; octave -= 1; }
    while (semitone >= 12) { semitone -= 12; octave += 1; }
    const scale = useFlat ? SCORE_CHROMATIC_FLAT : SCORE_CHROMATIC_SHARP;
    return `${scale[semitone]}${octave}`;
  };

  const parsedStaves = groupHits.map((st, idx) => {
    const nextPos = idx + 1 < groupHits.length ? Math.max(st.end, groupHits[idx + 1].pos - 48) : u8.length;
    const slice = u8.slice(st.end + 24, nextPos);

    let objStart = -1;
    for (let i = 0; i < slice.length - 10; i++) {
      const op = slice[i];
      if ((op === 0x00 || op === 0x01 || op === 0x05) && slice[i + 1] === 0 && slice[i + 2] === 0) {
        objStart = i;
        break;
      }
    }

    const headerBytes = objStart > 0 ? slice.slice(0, Math.min(objStart, 1800)) : slice.slice(0, Math.min(slice.length, 600));
    const rawText = decodeSmartBytes(headerBytes);
    const lyricTokens = (rawText.match(/[가-힣a-zA-Z0-9\s,.!?~'-]{2,}/g) || [])
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => /[가-힣]+|[a-zA-Z]{2,}/.test(s) && !/^(Standard|Staff|Layer|Default|Vocal|Orch|Choir)$/i.test(s));
    const lyrics = lyricTokens.join(' ').replace(/\s+/g, ' ').trim().slice(0, 140);

    let clefType = 0;
    let octaveShift = 0;
    let keyFlats = [];
    let keySharps = [];
    let barAcc = {};
    let keyName = 'C Major';
    let timeSig = '4/4';
    let barBeats = 4;
    let currentBpm = globalTempo || 108;
    let timeSec = 0;
    let pendingChordNotes = 0;
    let pendingChordDurSec = 0;
    const activeTies = {};
    const melodyNotes = [];
    const timedNotes = [];
    const isPerc = st.group === 'Percussion' || /percussion|drum|vp|beatbox/i.test(`${st.rawName} ${st.rawLabel}`);

    if (objStart >= 0 && !isPerc) {
      for (let i = objStart; i < slice.length - 10 && timedNotes.length < 420; i++) {
        const op = slice[i];
        if (op === 0x00 && slice[i + 1] === 0 && slice[i + 2] === 0 && slice[i + 3] <= 3 && slice[i + 5] <= 2) {
          clefType = slice[i + 3];
          octaveShift = slice[i + 5];
          i += 5;
        } else if (op === 0x01 && slice[i + 1] === 0 && slice[i + 2] === 0 && i + 12 < slice.length) {
          keyFlats = [];
          keySharps = [];
          for (let b = 0; b < 7; b++) {
            if (slice[i + 3] & (1 << b)) keyFlats.push(KEY_LETTERS[b]);
            if (slice[i + 5] & (1 << b)) keySharps.push(KEY_LETTERS[b]);
          }
          if (keyFlats.length > 0) keyName = MAJOR_KEYS_BY_FLATS[keyFlats.length] || 'C Major';
          else if (keySharps.length > 0) keyName = MAJOR_KEYS_BY_SHARPS[keySharps.length] || 'C Major';
          if (globalKey === 'C Major' && keyName !== 'C Major') globalKey = keyName;
          i += 12;
        } else if (op === 0x02 && slice[i + 1] === 0 && slice[i + 2] === 0 && slice[i + 3] <= 8) {
          barAcc = {};
          i += 4;
        } else if (op === 0x05 && slice[i + 1] === 0 && slice[i + 2] === 0 && slice[i + 3] >= 1 && slice[i + 3] <= 16 && slice[i + 5] <= 4) {
          const num = slice[i + 3];
          const den = 1 << slice[i + 5];
          timeSig = `${num}/${den}`;
          barBeats = (num * 4) / den;
          globalTimeSig = timeSig;
          i += 8;
        } else if (op === 0x06 && slice[i + 1] === 0 && slice[i + 2] === 0 && i + 8 < slice.length) {
          const bpm = slice[i + 5] | (slice[i + 6] << 8);
          if (bpm >= 35 && bpm <= 250) currentBpm = bpm;
          i += 8;
        } else if (op === 0x09 && slice[i + 1] === 0 && slice[i + 2] === 0 && slice[i + 3] <= 6 && slice[i + 4] === 0 && i + 11 <= slice.length) {
          const durCode = slice[i + 3];
          const dotFlags = slice[i + 7];
          const beats = durCode === 0 && !(dotFlags & 0x05)
            ? barBeats
            : (4 / Math.pow(2, durCode)) * ((dotFlags & 0x01) ? 1.75 : (dotFlags & 0x04) ? 1.5 : 1);
          timeSec += (beats * 60) / currentBpm;
          i += 10;
        } else if (op === 0x0a && slice[i + 1] === 0 && slice[i + 2] === 0 && slice[i + 3] <= 6 && slice[i + 4] === 0 && slice[i + 8] === 0 && i + 13 <= slice.length) {
          const durCode = slice[i + 3];
          const dotFlags = slice[i + 7];
          const beats = (4 / Math.pow(2, durCode)) * ((dotFlags & 0x01) ? 1.75 : (dotFlags & 0x04) ? 1.5 : 1);
          const count = slice[i + 12];
          if (count >= 1 && count <= 8) {
            pendingChordNotes = count;
            pendingChordDurSec = (beats * 60) / currentBpm;
          }
          i += 12;
        } else if (op === 0x08 && slice[i + 1] === 0 && slice[i + 2] === 0 && slice[i + 3] <= 6 && slice[i + 4] === 0 && slice[i + 8] === 0 && i + 11 <= slice.length) {
          const durCode = slice[i + 3];
          const dotFlags = slice[i + 7];
          const posVal = slice[i + 9] > 127 ? slice[i + 9] - 256 : slice[i + 9];
          const accCode = slice[i + 10] & 0x07;
          const tieStart = Boolean(dotFlags & 0x10);
          const beats = (4 / Math.pow(2, durCode)) * ((dotFlags & 0x01) ? 1.75 : (dotFlags & 0x04) ? 1.5 : 1);
          const durSec = pendingChordNotes > 0 ? pendingChordDurSec : (beats * 60) / currentBpm;

          if (Math.abs(posVal) <= 22) {
            const pitch = getPitchAtBinaryPos(clefType, octaveShift, posVal, keyFlats, keySharps, barAcc, accCode);
            const tieIdx = activeTies[pitch];
            if (melodyNotes.length < 16 && tieIdx === undefined && (pendingChordNotes <= 1)) {
              melodyNotes.push(pitch);
            }
            if (tieIdx !== undefined && timedNotes[tieIdx]) {
              timedNotes[tieIdx].durSec = Number((timedNotes[tieIdx].durSec + durSec).toFixed(4));
              if (!tieStart) delete activeTies[pitch];
            } else {
              timedNotes.push({
                note: pitch,
                startSec: Number(timeSec.toFixed(4)),
                durSec: Number(Math.max(0.06, durSec * 0.96).toFixed(4))
              });
              if (tieStart) activeTies[pitch] = timedNotes.length - 1;
            }
          }

          if (pendingChordNotes > 0) {
            pendingChordNotes -= 1;
            if (pendingChordNotes === 0) {
              timeSec += pendingChordDurSec;
              pendingChordDurSec = 0;
            }
          } else {
            timeSec += durSec;
          }
          i += 10;
        }
      }
    }

    const displayName = st.rawLabel || st.rawName || `Part ${idx + 1}`;
    return {
      name: displayName,
      subName: st.rawName && st.rawName !== displayName ? st.rawName : '',
      clef: (CLEF_NAMES[clefType] || 'Treble') + (octaveShift === 2 ? ' 8vb' : octaveShift === 1 ? ' 8va' : ''),
      keySig: keyName,
      timeSig,
      firstNote: melodyNotes[0] || null,
      melodyNotes: melodyNotes.slice(0, 16),
      timedNotes,
      lyrics
    };
  });

  return {
    format: 'NWC',
    title: fallbackTitle,
    author: '',
    musicalKey: globalKey,
    timeSig: globalTimeSig,
    tempo: globalTempo,
    staves: parsedStaves
  };
}

function parseMidiScoreDetail(buffer, fallbackTitle = '') {
  const u8 = new Uint8Array(buffer);
  const magic = new TextDecoder('ascii').decode(u8.slice(0, 4));
  if (magic !== 'MThd') {
    throw new Error('유효한 MIDI 파일(MThd)이 아닙니다.');
  }
  const numTracks = (u8[10] << 8) | u8[11];
  const rawDiv = (u8[12] << 8) | u8[13];
  const ticksPerBeat = (rawDiv & 0x8000) ? 480 : (rawDiv || 480);
  const firstTrackPos = 8 + ((u8[4] << 24) | (u8[5] << 16) | (u8[6] << 8) | u8[7]);
  let tempoBpm = null;
  let timeSig = '4/4';
  const tempoMap = [];
  const rawTracks = [];

  const readVarLen = (idx) => {
    let val = 0;
    let p = idx;
    while (p < u8.length) {
      const b = u8[p++];
      val = (val << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return { val, next: p };
  };

  let pos = firstTrackPos;
  for (let t = 0; t < numTracks && pos < u8.length - 8; t++) {
    const trkMagic = new TextDecoder('ascii').decode(u8.slice(pos, pos + 4));
    const trkLen = (u8[pos + 4] << 24) | (u8[pos + 5] << 16) | (u8[pos + 6] << 8) | u8[pos + 7];
    if (trkMagic !== 'MTrk') break;
    let p = pos + 8;
    const end = Math.min(u8.length, p + trkLen);
    let runningStatus = 0;
    let tick = 0;
    let trackName = '';
    let isDrumChannel = false;
    const notes = [];
    const noteEvents = [];
    const activeOn = new Map();

    while (p < end) {
      const delta = readVarLen(p);
      p = delta.next;
      tick += delta.val;
      if (p >= end) break;
      let status = u8[p];
      if (status < 0x80) {
        status = runningStatus;
      } else {
        p++;
        if (status < 0xf0) runningStatus = status;
      }

      const cmd = status & 0xf0;
      const ch = status & 0x0f;
      if (cmd === 0x90) {
        const note = u8[p++];
        const vel = u8[p++];
        if (ch === 9) isDrumChannel = true;
        if (vel > 0) {
          const name = SCORE_CHROMATIC_SHARP[note % 12] + (Math.floor(note / 12) - 1);
          if (notes.length < 16) notes.push(name);
          if (!activeOn.has(note)) activeOn.set(note, tick);
        } else if (activeOn.has(note)) {
          const startTick = activeOn.get(note);
          activeOn.delete(note);
          if (noteEvents.length < 480) {
            noteEvents.push({ note, startTick, endTick: Math.max(startTick + 1, tick) });
          }
        }
      } else if (cmd === 0x80) {
        const note = u8[p++];
        p++; // velocity
        if (activeOn.has(note)) {
          const startTick = activeOn.get(note);
          activeOn.delete(note);
          if (noteEvents.length < 480) {
            noteEvents.push({ note, startTick, endTick: Math.max(startTick + 1, tick) });
          }
        }
      } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
        p += 2;
      } else if (cmd === 0xc0 || cmd === 0xd0) {
        p += 1;
      } else if (status === 0xff) {
        const metaType = u8[p++];
        const lenRes = readVarLen(p);
        p = lenRes.next;
        const data = u8.slice(p, p + lenRes.val);
        if (metaType === 0x03 && !trackName) {
          trackName = decodeSmartBytes(data).replace(/\0/g, '').trim();
        } else if (metaType === 0x51 && data.length === 3) {
          const mpqn = (data[0] << 16) | (data[1] << 8) | data[2];
          if (mpqn > 0) {
            if (!tempoBpm) tempoBpm = Math.round(60000000 / mpqn);
            tempoMap.push({ tick, mpqn });
          }
        } else if (metaType === 0x58 && data.length >= 2) {
          timeSig = `${data[0]}/${Math.pow(2, data[1])}`;
        }
        p += lenRes.val;
      } else if (status === 0xf0 || status === 0xf7) {
        const lenRes = readVarLen(p);
        p = lenRes.next + lenRes.val;
      } else {
        break;
      }
    }

    if (notes.length > 0 && !isDrumChannel) {
      rawTracks.push({ trackName, notes, noteEvents });
    }
    pos = end;
  }

  tempoMap.sort((a, b) => a.tick - b.tick);
  const defaultMpqn = tempoBpm ? Math.round(60000000 / tempoBpm) : 545455; // ~110 BPM
  const ticksToSec = (targetTick) => {
    let sec = 0;
    let curTick = 0;
    let curMpqn = defaultMpqn;
    for (const te of tempoMap) {
      if (te.tick >= targetTick) break;
      if (te.tick > curTick) {
        sec += ((te.tick - curTick) / ticksPerBeat) * (curMpqn / 1000000);
        curTick = te.tick;
      }
      curMpqn = te.mpqn;
    }
    if (targetTick > curTick) {
      sec += ((targetTick - curTick) / ticksPerBeat) * (curMpqn / 1000000);
    }
    return sec;
  };

  const staves = rawTracks.map((trk, idx) => {
    const timedNotes = trk.noteEvents
      .sort((a, b) => a.startTick - b.startTick)
      .slice(0, 480)
      .map(ev => {
        const startSec = ticksToSec(ev.startTick);
        const endSec = ticksToSec(ev.endTick);
        const name = SCORE_CHROMATIC_SHARP[ev.note % 12] + (Math.floor(ev.note / 12) - 1);
        return {
          note: name,
          startSec: Number(startSec.toFixed(4)),
          durSec: Number(Math.max(0.06, endSec - startSec).toFixed(4))
        };
      });
    return {
      name: trk.trackName || `Track ${idx + 1}`,
      subName: `MIDI Ch.${idx + 1}`,
      clef: 'MIDI',
      keySig: 'Standard',
      timeSig,
      firstNote: trk.notes[0],
      melodyNotes: trk.notes,
      timedNotes,
      lyrics: ''
    };
  });

  return {
    format: 'MIDI',
    title: fallbackTitle,
    author: '',
    musicalKey: 'MIDI Track',
    timeSig,
    tempo: tempoBpm,
    staves
  };
}

async function parseMsczScoreDetail(buffer, fallbackTitle = '') {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('유효한 MuseScore(.mscz) 압축 파일이 아닙니다.');

  const cdCount = dv.getUint16(eocd + 10, true);
  let cdPos = dv.getUint32(eocd + 16, true);
  let mscxXml = '';

  for (let k = 0; k < cdCount && cdPos + 46 <= u8.length; k++) {
    if (dv.getUint32(cdPos, true) !== 0x02014b50) break;
    const method = dv.getUint16(cdPos + 10, true);
    const compSize = dv.getUint32(cdPos + 20, true);
    const nameLen = dv.getUint16(cdPos + 28, true);
    const extraLen = dv.getUint16(cdPos + 30, true);
    const commLen = dv.getUint16(cdPos + 32, true);
    const lfhOffset = dv.getUint32(cdPos + 42, true);
    const entryName = new TextDecoder('utf-8').decode(u8.slice(cdPos + 46, cdPos + 46 + nameLen));

    if (entryName.toLowerCase().endsWith('.mscx') && lfhOffset + 30 <= u8.length) {
      const lfhNameLen = dv.getUint16(lfhOffset + 26, true);
      const lfhExtraLen = dv.getUint16(lfhOffset + 28, true);
      const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
      const compSlice = u8.slice(dataStart, dataStart + compSize);
      if (method === 0) {
        mscxXml = new TextDecoder('utf-8').decode(compSlice);
      } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([compSlice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        mscxXml = await new Response(stream).text();
      } else {
        throw new Error('이 브라우저에서 MSCZ 압축 해제를 지원하지 않습니다.');
      }
      break;
    }
    cdPos += 46 + nameLen + extraLen + commLen;
  }

  if (!mscxXml) throw new Error('MSCZ 내부에서 악보 XML(.mscx)을 찾지 못했습니다.');

  const firstScoreIdx = mscxXml.indexOf('<Score');
  const secondScoreIdx = firstScoreIdx >= 0 ? mscxXml.indexOf('<Score', firstScoreIdx + 6) : -1;
  const mainXml = secondScoreIdx > 0 ? mscxXml.slice(firstScoreIdx, secondScoreIdx) : mscxXml;

  const KEY_BY_ACC = {
    '-7': 'Cb Major', '-6': 'Gb Major', '-5': 'Db Major', '-4': 'Ab Major', '-3': 'Eb Major', '-2': 'Bb Major', '-1': 'F Major',
    '0': 'C Major', '1': 'G Major', '2': 'D Major', '3': 'A Major', '4': 'E Major', '5': 'B Major', '6': 'F# Major', '7': 'C# Major'
  };
  const keyMatch = mainXml.match(/<KeySig>[\s\S]*?<(?:accidental|concertKey)>(-?\d+)<\/(?:accidental|concertKey)>[\s\S]*?<\/KeySig>/);
  const keyAccNum = keyMatch ? Number(keyMatch[1]) : 0;
  const musicalKey = KEY_BY_ACC[String(keyAccNum)] || 'C Major';

  const timeMatch = mainXml.match(/<TimeSig>[\s\S]*?<sigN>(\d+)<\/sigN>[\s\S]*?<sigD>(\d+)<\/sigD>[\s\S]*?<\/TimeSig>/);
  const sigN = timeMatch ? Number(timeMatch[1]) : 4;
  const sigD = timeMatch ? Number(timeMatch[2]) : 4;
  const timeSig = `${sigN}/${sigD}`;
  const defaultBarBeats = (sigN * 4) / (sigD || 4);

  const tempoMatch = mainXml.match(/<Tempo>[\s\S]*?<tempo>([\d.]+)<\/tempo>[\s\S]*?<\/Tempo>/);
  const tempo = tempoMatch ? Math.round(parseFloat(tempoMatch[1]) * 60) : null;
  const effectiveBpm = (tempo && tempo >= 30 && tempo <= 260) ? tempo : 108;

  const partMetaByStaffId = {};
  const partBlocks = mainXml.match(/<Part>[\s\S]*?<\/Part>/g) || [];
  partBlocks.forEach((pXml, pIdx) => {
    const longName = pXml.match(/<longName>([\s\S]*?)<\/longName>/)?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
    const trackName = pXml.match(/<trackName>([^<]+)<\/trackName>/)?.[1]?.trim() || '';
    const instId = pXml.match(/<instrumentId>([^<]+)<\/instrumentId>/)?.[1]?.trim() || '';
    const isPerc = /drum|percussion/i.test(instId) || pXml.includes('group="percussion"');
    const staffIds = [...pXml.matchAll(/<Staff\s+id="(\d+)"/g)].map(m => m[1]);
    staffIds.forEach((sid, sIdx) => {
      const baseName = longName || trackName || `Part ${pIdx + 1}`;
      partMetaByStaffId[sid] = {
        name: staffIds.length > 1 ? `${baseName} (${sIdx + 1})` : baseName,
        subName: trackName && trackName !== baseName ? trackName : '',
        isPerc
      };
    });
  });

  const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteNames = keyAccNum < 0 ? FLAT_NAMES : SHARP_NAMES;
  const MSCZ_DUR_BEATS = {
    long: 16, breve: 8, whole: 4, half: 2, quarter: 1,
    eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625
  };

  const bodyStart = Math.max(0, mainXml.lastIndexOf('</Part>'));
  const bodyXml = mainXml.slice(bodyStart);
  const staffMatches = [...bodyXml.matchAll(/<Staff\s+id="(\d+)">([\s\S]*?)<\/Staff>/g)];

  const staves = [];
  for (const sm of staffMatches) {
    const sid = sm[1];
    const sXml = sm[2];
    const meta = partMetaByStaffId[sid] || { name: `Part ${sid}`, subName: '', isPerc: false };
    if (meta.isPerc) continue;

    const clefCode = sXml.match(/<Clef>[\s\S]*?<concertClefType>([^<]+)<\/concertClefType>/)?.[1] || '';
    const clef = /^F/i.test(clefCode) ? 'Bass' : /8vb/i.test(clefCode) ? 'Treble 8vb' : 'Treble';

    const melodyNotes = [];
    const timedNotes = [];
    const lyricTokens = [];
    let barBeats = defaultBarBeats;
    let measureStartBeat = 0;

    const measures = sXml.match(/<Measure[\s\S]*?<\/Measure>/g) || [];
    for (const mXml of measures) {
      const mTime = mXml.match(/<TimeSig>[\s\S]*?<sigN>(\d+)<\/sigN>[\s\S]*?<sigD>(\d+)<\/sigD>[\s\S]*?<\/TimeSig>/);
      if (mTime) barBeats = (Number(mTime[1]) * 4) / (Number(mTime[2]) || 4);

      // 첫 번째 성부(Voice 1)만 시간축 진행에 사용
      const v1Xml = mXml.split(/<\/voice>|<voice>\s*[234]\s*<\/voice>/)[0] || mXml;
      let beatInBar = 0;
      const evRegex = /<(Chord|Rest)>([\s\S]*?)<\/\1>/g;
      let em;
      while ((em = evRegex.exec(v1Xml)) !== null) {
        const tag = em[1];
        const inner = em[2];
        const durType = inner.match(/<durationType>([^<]+)<\/durationType>/)?.[1]?.trim() || 'quarter';
        const dots = Number(inner.match(/<dots>(\d+)<\/dots>/)?.[1] || 0);
        let beats = durType === 'measure' ? barBeats : (MSCZ_DUR_BEATS[durType] ?? 1);
        if (dots === 1) beats *= 1.5;
        else if (dots >= 2) beats *= 1.75;

        if (tag === 'Chord') {
          if (lyricTokens.length < 24) {
            const lyr = inner.match(/<Lyrics>[\s\S]*?<text>([\s\S]*?)<\/text>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
            if (lyr) lyricTokens.push(lyr);
          }
          const pitches = [...inner.matchAll(/<Note>[\s\S]*?<pitch>(\d+)<\/pitch>/g)]
            .map(m => Number(m[1]))
            .filter(n => n >= 24 && n <= 108);
          if (pitches.length) {
            const topMidi = Math.max(...pitches);
            const topName = `${noteNames[topMidi % 12]}${Math.floor(topMidi / 12) - 1}`;
            if (melodyNotes.length < 16) melodyNotes.push(topName);
            if (timedNotes.length < 480) {
              const startSec = ((measureStartBeat + beatInBar) * 60) / effectiveBpm;
              const durSec = (beats * 60) / effectiveBpm;
              for (const midiNum of pitches.slice(0, 4)) {
                const nName = `${noteNames[midiNum % 12]}${Math.floor(midiNum / 12) - 1}`;
                timedNotes.push({
                  note: nName,
                  startSec: Number(startSec.toFixed(4)),
                  durSec: Number(Math.max(0.06, durSec * 0.96).toFixed(4))
                });
              }
            }
          }
        }
        beatInBar += beats;
      }
      measureStartBeat += Math.max(barBeats, beatInBar);
    }

    if (melodyNotes.length || lyricTokens.length) {
      staves.push({
        name: meta.name,
        subName: meta.subName,
        clef,
        keySig: musicalKey,
        timeSig,
        firstNote: melodyNotes[0] || null,
        melodyNotes,
        timedNotes,
        lyrics: lyricTokens.join(' ')
      });
    }
  }

  return {
    format: 'MSCZ',
    title: fallbackTitle,
    author: '',
    musicalKey,
    timeSig,
    tempo: tempo && tempo >= 30 && tempo <= 260 ? tempo : null,
    staves
  };
}

function renderStaffSvg(st, musicalKey = 'C Major', semitones = 0) {
  // 조바꿈 중이면 오선 위치·음 이름·클릭 소리 모두 바뀐 키 기준으로 맞춘다.
  const rawNotes = (Array.isArray(st?.melodyNotes) && st.melodyNotes.length
    ? st.melodyNotes.slice(0, 16)
    : (st?.firstNote ? [st.firstNote] : [])
  ).map(n => (semitones ? transposeNoteString(n, semitones) : n));
  const parsedNotes = rawNotes.map(n => ({ raw: n, parsed: parseNoteString(n) })).filter(x => x.parsed);
  if (!parsedNotes.length || typeof document === 'undefined' || typeof document.createElementNS !== 'function') {
    return null;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}, textContent = null) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) node.setAttribute(k, String(v));
    }
    if (textContent !== null) node.textContent = textContent;
    return node;
  };

  const LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const rawClef = String(st.clef || 'Treble');
  const avgOctave = parsedNotes.reduce((acc, x) => acc + x.parsed.octave, 0) / parsedNotes.length;
  const isBass = /bass/i.test(rawClef) || (rawClef === 'MIDI' && avgOctave < 3.4);
  const is8vb = !isBass && (/8vb/i.test(rawClef) || avgOctave < 3.85);
  // Bottom line step: E4 = 30 (Treble), E3 = 23 (Treble 8vb), G2 = 18 (Bass)
  const bottomLineStep = isBass ? 18 : (is8vb ? 23 : 30);

  const noteSpacing = 38;
  const startX = 68;
  const width = Math.max(320, startX + parsedNotes.length * noteSpacing + 24);
  const height = 96;
  const bottomLineY = 60;
  const stepPx = 4; // 8px between adjacent staff lines

  const svg = svgEl('svg', {
    class: 'score-staff-svg',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `${st.name} 오선보 미리보기 (${parsedNotes.length}음, 음표 클릭 시 재생)`
  });

  // 5 horizontal staff lines (steps 0, 2, 4, 6, 8 from bottom line)
  for (let l = 0; l < 5; l++) {
    const y = bottomLineY - l * 8;
    svg.appendChild(svgEl('line', {
      x1: 12, y1: y, x2: width - 12, y2: y,
      stroke: 'currentColor', 'stroke-opacity': '0.28', 'stroke-width': '1.1'
    }));
  }
  // Left & right barlines
  svg.appendChild(svgEl('line', { x1: 12, y1: 28, x2: 12, y2: 60, stroke: 'currentColor', 'stroke-opacity': '0.45', 'stroke-width': '1.6' }));
  svg.appendChild(svgEl('line', { x1: width - 12, y1: 28, x2: width - 12, y2: 60, stroke: 'currentColor', 'stroke-opacity': '0.45', 'stroke-width': '1.6' }));

  // Clef symbol
  svg.appendChild(svgEl('text', {
    x: 20,
    y: isBass ? 52 : 55,
    'font-size': isBass ? '27' : '32',
    fill: 'currentColor',
    'fill-opacity': '0.82',
    style: 'user-select: none; font-family: serif;'
  }, isBass ? '𝄢' : '𝄞'));

  if (is8vb) {
    svg.appendChild(svgEl('text', {
      x: 26, y: 71, 'font-size': '10', 'font-weight': '700', fill: 'currentColor', 'fill-opacity': '0.7'
    }, '8'));
  }

  // Key badge in top-left corner of staff
  if (musicalKey && musicalKey !== 'MIDI Track') {
    svg.appendChild(svgEl('text', {
      x: 46, y: 17, 'font-size': '10', 'font-weight': '600', fill: 'currentColor', 'fill-opacity': '0.6'
    }, musicalKey));
  }

  parsedNotes.forEach(({ raw, parsed }, idx) => {
    const cx = startX + idx * noteSpacing;
    const diatonicStep = (LETTER_STEP[parsed.root] ?? 0) + parsed.octave * 7;
    const relStep = Math.max(-6, Math.min(14, diatonicStep - bottomLineStep));
    const cy = bottomLineY - relStep * stepPx;

    const g = svgEl('g', {
      class: `svg-staff-note${idx === 0 ? ' is-first' : ''}`,
      tabindex: '0',
      role: 'button',
      'data-pitch-trigger': 'true',
      'aria-label': `${parsed.displayNote} (${parsed.koreanNote}) 소리 듣기`
    });
    g.appendChild(svgEl('title', {}, `${parsed.displayNote} (${parsed.koreanNote}) 클릭하여 소리 듣기`));

    // Ledger lines below bottom line (relStep <= -2) or above top line (relStep >= 10)
    if (relStep <= -2) {
      for (let s = -2; s >= relStep; s -= 2) {
        const ly = bottomLineY - s * stepPx;
        g.appendChild(svgEl('line', { x1: cx - 9, y1: ly, x2: cx + 9, y2: ly, stroke: 'currentColor', 'stroke-opacity': '0.45', 'stroke-width': '1.2' }));
      }
    } else if (relStep >= 10) {
      for (let s = 10; s <= relStep; s += 2) {
        const ly = bottomLineY - s * stepPx;
        g.appendChild(svgEl('line', { x1: cx - 9, y1: ly, x2: cx + 9, y2: ly, stroke: 'currentColor', 'stroke-opacity': '0.45', 'stroke-width': '1.2' }));
      }
    }

    // Invisible touch target rect for comfortable mobile tapping
    g.appendChild(svgEl('rect', { x: cx - 16, y: 16, width: 32, height: 74, fill: 'transparent' }));

    // Accidental (# / b)
    if (parsed.acc) {
      g.appendChild(svgEl('text', {
        x: cx - 14,
        y: cy + 4,
        'font-size': '12',
        'font-weight': '700',
        fill: idx === 0 ? 'var(--brand, #146458)' : 'currentColor'
      }, parsed.acc === 'b' ? '♭' : '♯'));
    }

    // Stem (up if relStep < 4, down if relStep >= 4)
    const stemUp = relStep < 4;
    g.appendChild(svgEl('line', {
      x1: stemUp ? cx + 4.5 : cx - 4.5,
      y1: cy,
      x2: stemUp ? cx + 4.5 : cx - 4.5,
      y2: stemUp ? cy - 22 : cy + 22,
      stroke: idx === 0 ? 'var(--brand, #146458)' : 'currentColor',
      'stroke-width': '1.4',
      'stroke-opacity': '0.85'
    }));

    // Notehead
    g.appendChild(svgEl('ellipse', {
      cx,
      cy,
      rx: '5.2',
      ry: '3.8',
      transform: `rotate(-18 ${cx} ${cy})`,
      fill: idx === 0 ? 'var(--brand, #146458)' : 'currentColor'
    }));

    // Pitch label underneath
    g.appendChild(svgEl('text', {
      x: cx,
      y: 88,
      'text-anchor': 'middle',
      'font-size': '9.5',
      'font-weight': idx === 0 ? '700' : '500',
      fill: idx === 0 ? 'var(--brand, #146458)' : 'currentColor',
      'fill-opacity': idx === 0 ? '1' : '0.72'
    }, parsed.displayNote));

    const triggerNote = (ev) => {
      ev.stopPropagation();
      playNoteString(raw);
    };
    g.addEventListener('click', triggerNote);
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        triggerNote(ev);
      }
    });

    svg.appendChild(g);
  });

  const wrap = el('div', { class: 'score-staff-svg-wrap' });
  wrap.appendChild(svg);
  return wrap;
}


export async function openScorePreviewModal(score, options = {}) {
  const existing = document.getElementById('score-preview-dialog');
  if (existing) existing.remove();

  const safeUrl = score.blobUrl ? score.blobUrl : (score.fileUrl ? encodeURI(decodeURI(score.fileUrl)) : '');
  const linkedSong = state.songs.find(s => s.id === score.songId || String(s.id).replace(/-[0-9]+$/, '') === score.songId);
  const siblingScores = score.songId ? getScoresForSong(state.scores, score.songId) : [];
  const fmtKey = getScoreFormatKey(score);
  const hasExplicitTranspose = options && options.transpose !== undefined && options.transpose !== null && Number.isFinite(Number(options.transpose));
  const initialSemi = hasExplicitTranspose
    ? Math.max(-6, Math.min(6, Math.round(Number(options.transpose))))
    : (linkedSong ? getSongTranspose(linkedSong.id) : 0);
  let multiPlayer = null;

  const cleanupPreviewAudio = () => {
    if (multiPlayer) {
      multiPlayer.destroy();
      multiPlayer = null;
    }
    stopPitch(true);
  };

  const dialog = el('dialog', {
    id: 'score-preview-dialog',
    class: 'stage-modal-dialog score-preview-dialog',
    'aria-labelledby': 'score-preview-modal-title'
  });

  const closePreview = () => {
    cleanupPreviewAudio();
    dialog.close();
  };

  const fmtDisplay = fmtKey === 'midi'
    ? 'MIDI'
    : fmtKey === 'mscz'
    ? 'MSCZ'
    : (score.format || score.fileType || 'NWC').toUpperCase();

  const header = el('div', { class: 'stage-modal-header' },
    el('div', {},
      el('div', { style: 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px;' },
        el('span', { class: 'badge', style: 'background: var(--brand); color: #fff; font-weight: 700;', text: fmtDisplay }),
        score.category && el('span', { class: 'badge', text: score.category }),
        score.year && el('span', { class: 'badge', text: `${score.year}년` })
      ),
      el('h3', { id: 'score-preview-modal-title', text: `🎼 ${score.title}` }),
      el('p', { style: 'font-size: 12.5px; color: var(--muted); margin-top: 2px;', text: fmtKey === 'pdf' ? `${score.fileName || score.title} · 인앱 PDF 악보 뷰어 & 첫음 조율` : `${score.fileName || score.title} · 멀티트랙 하모니 플레이어 & 성부별 Solo·Mute 마이너스원` })
    ),
    button('✕', closePreview, 'icon-button', null, { 'aria-label': '닫기' })
  );

  const switcherBar = siblingScores.length > 1
    ? el('div', { class: 'chip-group', style: 'margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border);' },
        el('span', { style: 'font-size: 11.5px; font-weight: 700; color: var(--muted); align-self: center; margin-right: 4px;', text: '이 곡의 다른 자료:' }),
        ...siblingScores.map(sib => button(
          `${getScoreFormatKey(sib).toUpperCase()} · ${sib.title}`,
          () => {
            if (sib.id === score.id) return;
            cleanupPreviewAudio();
            dialog.close();
            openOrDownloadScore(sib, false, options);
          },
          `chip${sib.id === score.id ? ' active' : ''}`
        ))
      )
    : null;

  const contentBox = el('div', { class: 'stage-modal-body score-preview-body' },
    switcherBar,
    el('div', { class: 'loading-state', style: 'padding: 28px; text-align: center;', text: '악보 데이터를 불러오고 있어요…' })
  );

  dialog.append(header, contentBox);
  dialog.addEventListener('close', () => {
    cleanupPreviewAudio();
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();

  // PDF In-App Viewer Mode
  if (fmtKey === 'pdf') {
    const songSemi = initialSemi;
    const songPitches = linkedSong?.startingPitches
      ? Object.entries(linkedSong.startingPitches)
          .filter(([k, v]) => k !== 'key' && typeof v === 'string' && parseNoteString(v))
          .map(([k, v]) => [k, transposeNoteString(v, songSemi)])
      : [];
    const dispKey = linkedSong?.musicalKey ? transposeMusicalKey(linkedSong.musicalKey, songSemi) : '';
    const pdfQuickPitchBar = songPitches.length
      ? el('div', { class: 'score-preview-summary', style: 'margin-bottom: 10px;' },
          el('div', { class: 'score-preview-meta-chips' },
            dispKey && el('span', { class: 'badge', style: 'font-weight: 700;', text: `조성: ${dispKey}${songSemi ? ` (${formatTransposeBadgeText(songSemi)})` : ''}` }),
            linkedSong.bpm && el('span', { class: 'badge', text: `템포: ♩=${linkedSong.bpm}` }),
            ...songPitches.map(([pKey, noteStr]) => button(
              `🔊 ${PARTS[pKey] || pKey} ${parseNoteString(noteStr)?.displayNote || noteStr}`,
              () => playNoteString(noteStr),
              'chip',
              null,
              { 'data-pitch-trigger': 'true' }
            ))
          ),
          el('div', { class: 'score-preview-top-actions' },
            button('🎹 전 파트 화음', () => playChordStrings(songPitches.map(([, n]) => n), 0.38, true, 2500), 'button primary small', null, { 'data-pitch-trigger': 'true' }),
            button('⏹ 정지', () => stopPitch(true), 'button ghost small')
          )
        )
      : null;

    const pdfFrame = el('iframe', {
      class: 'score-pdf-frame',
      src: `${safeUrl}#view=FitH`,
      title: `${score.title} PDF 악보 미리보기`
    });

    const pdfFooter = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border);' },
      el('div', { style: 'display: flex; gap: 8px; flex-wrap: wrap;' },
        button('🔍 새 탭에서 크게 열기 ↗', () => window.open(safeUrl, '_blank', 'noopener,noreferrer'), 'button secondary small', 'external'),
        button('📥 PDF 다운로드', () => openOrDownloadScore(score, true), 'button secondary small', 'download'),
        linkedSong ? button(`🎵 '${linkedSong.title}' 연습실 이동`, () => {
          closePreview();
          openSong(linkedSong);
        }, 'button secondary small') : null
      ),
      button('닫기', closePreview, 'button primary small')
    );

    contentBox.replaceChildren(...[switcherBar, pdfQuickPitchBar, pdfFrame, pdfFooter].filter(Boolean));
    return;
  }

  try {
    const res = await fetch(safeUrl);
    if (!res.ok) throw new Error(`파일을 불러올 수 없습니다 (${res.status})`);
    const buf = await res.arrayBuffer();
    const detail = fmtKey === 'midi'
      ? parseMidiScoreDetail(buf, score.title)
      : fmtKey === 'mscz'
      ? await parseMsczScoreDetail(buf, score.title)
      : await parseNwcScoreDetail(buf, score.title);

    const validStaves = detail.staves.filter(st => st.firstNote || st.lyrics || st.name);
    let scoreSemi = initialSemi;
    const getTransposedFirstNotes = () => validStaves.map(st => st.firstNote ? transposeNoteString(st.firstNote, scoreSemi) : null).filter(Boolean);
    const effectiveTempo = detail.tempo || linkedSong?.bpm || null;
    const hasMultiTrackNotes = validStaves.some(st => Array.isArray(st.timedNotes) && st.timedNotes.length > 0);

    const keyMetaBadge = detail.musicalKey
      ? el('span', { class: 'badge', style: 'font-weight: 700;', text: `조성: ${transposeMusicalKey(detail.musicalKey, scoreSemi)}${scoreSemi ? ` (${formatTransposeBadgeText(scoreSemi)})` : ''}` })
      : null;

    const summaryBar = el('div', { class: 'score-preview-summary' },
      el('div', { class: 'score-preview-meta-chips' },
        keyMetaBadge,
        detail.timeSig && el('span', { class: 'badge', text: `박자: ${detail.timeSig}` }),
        effectiveTempo && el('span', { class: 'badge', text: `템포: ♩=${effectiveTempo}` }),
        el('span', { class: 'badge', text: `분석 성부: ${validStaves.length}개 파트` })
      ),
      el('div', { class: 'score-preview-top-actions' },
        getTransposedFirstNotes().length > 0 ? button('🎹 전 파트 화음 듣기', () => {
          if (multiPlayer?.getState().isPlaying) multiPlayer.pause();
          const notesNow = getTransposedFirstNotes();
          playChordStrings(notesNow, 0.38, true, 2500);
          toast(`🎹 ${notesNow.length}개 성부 첫 음 화음(${notesNow.join(' · ')})을 재생합니다.`);
        }, 'button primary small', null, { 'data-pitch-trigger': 'true' }) : null,
        getTransposedFirstNotes().length > 0 ? button('🎼 파트별 첫음 순차 듣기', () => {
          if (multiPlayer?.getState().isPlaying) multiPlayer.pause();
          const seq = validStaves
            .filter(st => st.firstNote && parseNoteString(st.firstNote))
            .map(st => ({ noteStr: transposeNoteString(st.firstNote, scoreSemi), label: st.name }));
          if (seq.length) {
            playPitchSequence(seq, { noteDuration: 680, gapDuration: 120, chordDuration: 2200, keepOrder: true });
            toast('🎼 위 성부부터 차례대로 첫 음과 전체 화음을 재생합니다.');
          }
        }, 'button secondary small', null, { 'data-pitch-trigger': 'true' }) : null,
        effectiveTempo ? button(`⏱️ 메트로놈 (${effectiveTempo})`, () => {
          closePreview();
          openPitchPipe(effectiveTempo);
        }, 'button secondary small') : null,
        button('⏹ 소리 끄기', () => {
          multiPlayer?.stop();
          stopPitch(true);
        }, 'button ghost small')
      )
    );

    const staffCardRefs = [];
    let syncMultiTrackUiRef = null;
    let rerenderStaffCards = () => {};
    let multiTrackPanel = null;

    if (hasMultiTrackNotes) {
      let isScrubbing = false;
      const playToggleBtn = el('button', {
        type: 'button',
        class: 'button primary small multitrack-ctrl-btn multitrack-play-btn',
        'data-pitch-trigger': 'true',
        onclick: () => {
          stopPitch(true);
          multiPlayer?.togglePlay();
        }
      }, '▶ 전 성부 하모니 재생');

      const stopResetBtn = el('button', {
        type: 'button',
        class: 'button secondary small multitrack-ctrl-btn',
        onclick: () => multiPlayer?.stop()
      }, '⏹ 처음');

      const timeReadout = el('span', { class: 'multitrack-time-readout', text: '0:00 / 0:00' });
      const seekSlider = el('input', {
        type: 'range',
        class: 'multitrack-seek-slider',
        min: '0',
        max: '100',
        step: '0.1',
        value: '0',
        'aria-label': '악보 멀티트랙 재생 위치 이동',
        onpointerdown: () => { isScrubbing = true; },
        onpointerup: () => { isScrubbing = false; },
        oninput: (e) => {
          multiPlayer?.seekTo(Number(e.target.value));
        },
        onchange: (e) => {
          isScrubbing = false;
          multiPlayer?.seekTo(Number(e.target.value));
        }
      });

      const rateButtons = [0.75, 1.0, 1.25].map((r) => {
        const btn = el('button', {
          type: 'button',
          class: `chip multitrack-ctrl-btn${r === 1.0 ? ' active' : ''}`,
          onclick: () => {
            multiPlayer?.setRate(r);
            toast(`🏃 악보 재생 배속: ${r}x`);
          }
        }, `${r}x`);
        btn.dataset.rate = String(r);
        return btn;
      });

      const transposeBadge = el('span', {
        class: 'multitrack-transpose-label',
        text: formatTransposeBadgeText(scoreSemi)
      });

      const applyScoreTranspose = (nextSemi) => {
        scoreSemi = Math.max(-6, Math.min(6, Math.round(nextSemi)));
        multiPlayer?.setTranspose(scoreSemi);
        transposeBadge.textContent = formatTransposeBadgeText(scoreSemi);
        if (keyMetaBadge && detail.musicalKey) {
          keyMetaBadge.textContent = `조성: ${transposeMusicalKey(detail.musicalKey, scoreSemi)}${scoreSemi ? ` (${formatTransposeBadgeText(scoreSemi)})` : ''}`;
        }
        rerenderStaffCards();
        toast(scoreSemi === 0 ? '🎹 원키(0)로 되돌렸습니다.' : `🎹 악보 하모니 키: ${formatTransposeBadgeText(scoreSemi)}`);
      };

      const transMinusBtn = el('button', {
        type: 'button',
        class: 'pitch-transpose-btn multitrack-ctrl-btn',
        title: '반음 내리기 (♭ -1)',
        onclick: () => applyScoreTranspose(scoreSemi - 1)
      }, '♭ -1');
      const transResetBtn = el('button', {
        type: 'button',
        class: 'pitch-transpose-btn multitrack-ctrl-btn',
        title: '원키로 복귀',
        onclick: () => applyScoreTranspose(0)
      }, transposeBadge);
      const transPlusBtn = el('button', {
        type: 'button',
        class: 'pitch-transpose-btn multitrack-ctrl-btn',
        title: '반음 올리기 (♯ +1)',
        onclick: () => applyScoreTranspose(scoreSemi + 1)
      }, '♯ +1');

      const clearMixerBtn = el('button', {
        type: 'button',
        class: 'button ghost small multitrack-ctrl-btn',
        hidden: true,
        onclick: () => {
          multiPlayer?.clearSoloMute();
          toast('🔊 전 성부 소리를 모두 켰습니다.');
        }
      }, '🔊 전체 성부 켜기');

      const mixerStatusHint = el('p', {
        class: 'multitrack-mixer-hint',
        text: '💡 성부 카드의 [🎧 Solo]로 내 파트만 집중 청취하거나, [🔇 Mute]로 내 파트만 끄고 마이너스원 화음 반주에 맞춰 노래해 보세요.'
      });

      const syncMultiTrackUi = (st) => {
        syncMultiTrackUiRef = syncMultiTrackUi;
        playToggleBtn.textContent = st.isPlaying ? '⏸ 일시정지' : '▶ 전 성부 하모니 재생';
        playToggleBtn.classList.toggle('playing', st.isPlaying);
        seekSlider.max = String(Math.max(1, Number(st.duration.toFixed(2))));
        if (!isScrubbing) {
          seekSlider.value = String(Math.min(st.duration, Number(st.currentTime.toFixed(2))));
        }
        timeReadout.textContent = `${formatPlayerTime(st.currentTime)} / ${formatPlayerTime(st.duration)}`;
        rateButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.rate) === st.rate));
        const anySoloOrMute = st.tracks.some(t => t.solo || t.muted);
        clearMixerBtn.hidden = !anySoloOrMute;

        const soloNames = st.tracks.filter(t => t.solo).map(t => t.name);
        const mutedNames = st.tracks.filter(t => t.muted).map(t => t.name);
        if (soloNames.length) {
          mixerStatusHint.textContent = `🎧 단독 청취(Solo) 중: ${soloNames.join(', ')} 성부만 재생됩니다.`;
        } else if (mutedNames.length) {
          mixerStatusHint.textContent = `🎤 마이너스원(Mute) 반주 중: ${mutedNames.join(', ')} 제외 나머지 화음이 재생됩니다.`;
        } else {
          mixerStatusHint.textContent = '💡 성부 카드의 [🎧 Solo]로 내 파트만 집중 청취하거나, [🔇 Mute]로 내 파트만 끄고 마이너스원 화음 반주에 맞춰 노래해 보세요.';
        }

        staffCardRefs.forEach((ref, idx) => {
          const trk = st.tracks[idx];
          if (!ref || !trk) return;
          ref.card.classList.toggle('is-solo', trk.solo);
          ref.card.classList.toggle('is-muted', !trk.audible);
          if (ref.soloBtn) {
            ref.soloBtn.classList.toggle('active', trk.solo);
            ref.soloBtn.setAttribute('aria-pressed', String(trk.solo));
          }
          if (ref.muteBtn) {
            ref.muteBtn.classList.toggle('active', trk.muted);
            ref.muteBtn.setAttribute('aria-pressed', String(trk.muted));
          }
        });
      };

      multiPlayer = createMultiTrackScorePlayer(
        validStaves.map((st, idx) => ({
          id: `staff-${idx}`,
          name: st.name,
          notes: st.timedNotes || []
        })),
        { onTick: syncMultiTrackUi }
      );
      if (scoreSemi !== 0) {
        multiPlayer.setTranspose(scoreSemi);
      }

      multiTrackPanel = el('section', { class: 'multitrack-player-panel', 'aria-label': '멀티트랙 하모니 플레이어 및 성부 믹서' },
        el('div', { class: 'multitrack-main-row' },
          el('div', { class: 'multitrack-transport' }, playToggleBtn, stopResetBtn, timeReadout),
          seekSlider
        ),
        el('div', { class: 'multitrack-sub-row' },
          el('div', { class: 'multitrack-rate-box' },
            el('span', { class: 'multitrack-sub-label', text: '배속:' }),
            ...rateButtons
          ),
          el('div', { class: 'pitch-transpose-group' },
            el('span', { class: 'multitrack-sub-label', text: '조바꿈:' }),
            transMinusBtn,
            transResetBtn,
            transPlusBtn
          ),
          clearMixerBtn
        ),
        mixerStatusHint
      );

      syncMultiTrackUi(multiPlayer.getState());
    }

    const buildStaffCards = () => (validStaves.length ? validStaves.map((st, idx) => {
        const parsedFirst = st.firstNote ? parseNoteString(transposeNoteString(st.firstNote, scoreSemi)) : null;
        const hasTimed = Array.isArray(st.timedNotes) && st.timedNotes.length > 0;

        const soloBtn = hasTimed && multiPlayer
          ? el('button', {
              type: 'button',
              class: 'staff-solo-btn',
              'aria-pressed': 'false',
              title: `${st.name} 성부만 단독 청취 (Solo)`,
              onclick: () => {
                multiPlayer.toggleSolo(idx);
                if (!multiPlayer.getState().isPlaying) {
                  stopPitch(true);
                  multiPlayer.play();
                }
              }
            }, '🎧 Solo')
          : null;

        const muteBtn = hasTimed && multiPlayer
          ? el('button', {
              type: 'button',
              class: 'staff-mute-btn',
              'aria-pressed': 'false',
              title: `${st.name} 성부만 끄기 (마이너스원 반주)`,
              onclick: () => {
                multiPlayer.toggleMute(idx);
              }
            }, '🔇 Mute')
          : null;

        const playFirstBtn = parsedFirst
          ? button(`🔊 첫음 ${parsedFirst.displayNote}`, () => {
              if (multiPlayer?.getState().isPlaying) multiPlayer.pause();
              const target = transposeNoteString(st.firstNote, scoreSemi);
              playNoteString(target);
              toast(`🎵 [${st.name}] 첫 음: ${parseNoteString(target)?.displayNote || target}`);
            }, 'button primary small', null, { 'data-pitch-trigger': 'true' })
          : el('span', { style: 'font-size: 12px; color: var(--muted);', text: '첫음 없음' });

        const playMelodyBtn = st.melodyNotes && st.melodyNotes.length > 1
          ? button(`🎶 도입부 (${st.melodyNotes.length}음)`, () => {
              if (multiPlayer?.getState().isPlaying) multiPlayer.pause();
              const seq = st.melodyNotes
                .map(n => transposeNoteString(n, scoreSemi))
                .filter(n => parseNoteString(n))
                .map((n, nIdx) => ({ noteStr: n, label: `${st.name} #${nIdx + 1}` }));
              if (seq.length) {
                playPitchSequence(seq, { noteDuration: 360, gapDuration: 70, keepOrder: true, skipChord: true });
                toast(`🎶 [${st.name}] 도입부 ${seq.length}음을 연속 재생합니다.`);
              }
            }, 'button secondary small', null, { 'data-pitch-trigger': 'true' })
          : null;

        const staffSvgEl = renderStaffSvg(st, detail.musicalKey ? transposeMusicalKey(detail.musicalKey, scoreSemi) : 'C Major', scoreSemi);

        const notesRow = st.melodyNotes && st.melodyNotes.length
          ? el('div', { class: 'score-preview-notes-row' },
              ...st.melodyNotes.map((n, nIdx) => {
                const shifted = transposeNoteString(n, scoreSemi);
                const p = parseNoteString(shifted);
                return el('button', {
                  type: 'button',
                  class: `score-note-pill${nIdx === 0 ? ' first' : ''}`,
                  title: `${p ? p.displayNote : shifted} 클릭하여 소리 듣기`,
                  onclick: () => playNoteString(shifted)
                }, p ? p.displayNote : shifted);
              })
            )
          : null;

        const lyricsRow = st.lyrics
          ? el('p', { class: 'score-preview-lyrics', text: `💬 가사: ${st.lyrics}` })
          : null;

        const card = el('article', { class: 'score-preview-staff-card' },
          el('div', { class: 'score-preview-staff-head' },
            el('div', {},
              el('span', { class: 'score-staff-num', text: `${idx + 1}` }),
              el('strong', { class: 'score-staff-name', text: st.name }),
              st.subName && el('span', { style: 'font-size: 12px; color: var(--muted); margin-left: 6px;', text: `(${st.subName})` }),
              el('span', { class: 'badge', style: 'margin-left: 8px; font-size: 11px;', text: st.clef })
            ),
            el('div', { class: 'score-staff-actions-wrap' },
              soloBtn,
              muteBtn,
              playFirstBtn,
              playMelodyBtn
            )
          ),
          staffSvgEl,
          notesRow,
          lyricsRow
        );

        staffCardRefs.push({ card, soloBtn, muteBtn });
        return card;
      }) : [
        el('p', { style: 'padding: 20px; text-align: center; color: var(--muted);', text: '이 악보 파일에서 개별 성부 노트를 찾지 못했습니다. 아래 버튼으로 원본 파일을 다운로드해 확인해 주세요.' })
      ]);
    const staffList = el('div', { class: 'score-preview-staff-list' }, ...buildStaffCards());
    // 악보 창 안에서 키를 바꾸면 성부 카드(첫 음 버튼·오선·음 버튼)를 새 키로 다시 그린다.
    rerenderStaffCards = () => {
      staffCardRefs.length = 0;
      staffList.replaceChildren(...buildStaffCards());
      if (multiPlayer && syncMultiTrackUiRef) syncMultiTrackUiRef(multiPlayer.getState());
    };

    const footerBar = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);' },
      el('div', { style: 'display: flex; gap: 8px; flex-wrap: wrap;' },
        button('📥 원본 파일 다운로드', () => openOrDownloadScore(score, true), 'button secondary small', 'download'),
        score.driveUrl ? button('📁 구글 드라이브 ↗', () => window.open(score.driveUrl, '_blank', 'noopener,noreferrer'), 'button ghost small') : null,
        linkedSong ? button(`🎵 '${linkedSong.title}' 연습실 이동`, () => {
          closePreview();
          openSong(linkedSong);
        }, 'button secondary small') : null
      ),
      button('닫기', closePreview, 'button primary small')
    );

    contentBox.replaceChildren(...[switcherBar, summaryBar, multiTrackPanel, staffList, footerBar].filter(Boolean));
  } catch (err) {
    console.warn('Score preview failed, offering download instead:', err);
    contentBox.replaceChildren(
      ...[
        switcherBar,
        el('div', { style: 'padding: 20px; text-align: center;' },
          el('p', { style: 'margin-bottom: 12px; color: var(--muted);', text: `미리보기를 불러오지 못했습니다 (${err.message}). 원본 파일을 바로 다운로드할 수 있습니다.` }),
          el('div', { style: 'display: flex; justify-content: center; gap: 8px;' },
            button('📥 원본 파일 다운로드', () => {
              dialog.close();
              openOrDownloadScore(score, true);
            }, 'button primary small', 'download'),
            button('닫기', closePreview, 'button secondary small')
          )
        )
      ].filter(Boolean)
    );
  }
}
