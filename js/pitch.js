/**
 * Vocal Pitch Pipe (첫 음 잡기 / 피치파이프)
 * Web Audio API-based tone generator for a cappella vocalists and choir groups.
 */

export const NOTES = [
  { semitone: 0, note: 'C', korean: '도', solfege: 'Do', accidental: false },
  { semitone: 1, note: 'C#', alt: 'D♭', korean: '도#', solfege: 'Do#', accidental: true },
  { semitone: 2, note: 'D', korean: '레', solfege: 'Re', accidental: false },
  { semitone: 3, note: 'D#', alt: 'E♭', korean: '레#', solfege: 'Re#', accidental: true },
  { semitone: 4, note: 'E', korean: '미', solfege: 'Mi', accidental: false },
  { semitone: 5, note: 'F', korean: '파', solfege: 'Fa', accidental: false },
  { semitone: 6, note: 'F#', alt: 'G♭', korean: '파#', solfege: 'Fa#', accidental: true },
  { semitone: 7, note: 'G', korean: '솔', solfege: 'Sol', accidental: false },
  { semitone: 8, note: 'G#', alt: 'A♭', korean: '솔#', solfege: 'Sol#', accidental: true },
  { semitone: 9, note: 'A', korean: '라', solfege: 'La', accidental: false },
  { semitone: 10, note: 'A#', alt: 'B♭', korean: '라#', solfege: 'La#', accidental: true },
  { semitone: 11, note: 'B', korean: '시', solfege: 'Ti', accidental: false },
];

export const OCTAVES = [
  { octave: 3, label: '3옥타브 (베이스/남성 저음)' },
  { octave: 4, label: '4옥타브 (기본/테너·알토)' },
  { octave: 5, label: '5옥타브 (소프라노/고음)' },
];

/**
 * Calculate frequency in Hz for a semitone and octave.
 * A4 = 440 Hz (MIDI 69)
 */
export function getNoteFrequency(semitone, octave = 4) {
  const midi = (octave + 1) * 12 + semitone;
  return Number((440 * Math.pow(2, (midi - 69) / 12)).toFixed(2));
}

let audioCtx = null;
let currentOscillators = [];
let currentGainNode = null;
let currentPlaying = null;
const stateListeners = new Set();

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function subscribePitchState(callback) {
  if (typeof callback !== 'function') return () => {};
  stateListeners.add(callback);
  return () => stateListeners.delete(callback);
}

export function unlockAudioContext() {
  if (typeof window === 'undefined') return;
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    unlockAudioContext();
  };
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
  window.addEventListener('click', unlock, { once: true, passive: true });
}

function notifyStateChange() {
  for (const listener of stateListeners) {
    try {
      listener(currentPlaying);
    } catch (e) {
      console.error(e);
    }
  }
}

let sequenceTimer = null;
let currentSequence = null;

export function stopPitchSequence() {
  if (sequenceTimer) {
    clearTimeout(sequenceTimer);
    sequenceTimer = null;
  }
  const prevSeq = currentSequence;
  currentSequence = null;
  stopPitch(false);
  if (prevSeq && typeof prevSeq.onStep === 'function') {
    try { prevSeq.onStep({ type: 'finish', stoppedEarly: true }); } catch {}
  }
}

export function isPitchSequencePlaying() {
  return Boolean(currentSequence);
}

export function getCurrentSequence() {
  return currentSequence;
}

/**
 * Stop any currently sounding pitch or chord.
 */
export function stopPitch(cancelSequence = true) {
  if (cancelSequence) {
    if (sequenceTimer) {
      clearTimeout(sequenceTimer);
      sequenceTimer = null;
    }
    if (currentSequence) {
      const prevSeq = currentSequence;
      currentSequence = null;
      if (prevSeq && typeof prevSeq.onStep === 'function') {
        try { prevSeq.onStep({ type: 'finish', stoppedEarly: true }); } catch {}
      }
    }
  }

  if (currentGainNode && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      const closingGain = currentGainNode;
      const closingOscs = currentOscillators;
      currentOscillators = [];
      currentGainNode = null;
      closingGain.gain.cancelScheduledValues(now);
      closingGain.gain.setValueAtTime(closingGain.gain.value, now);
      closingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      setTimeout(() => {
        for (const osc of closingOscs) {
          try { osc.stop(); osc.disconnect(); } catch {}
        }
      }, 120);
    } catch {
      currentOscillators = [];
      currentGainNode = null;
    }
  } else {
    for (const osc of currentOscillators) {
      try { osc.stop(); osc.disconnect(); } catch {}
    }
    currentOscillators = [];
    currentGainNode = null;
  }
  currentPlaying = null;
  notifyStateChange();
}

/**
 * Play a specific pitch (semitone: 0~11, octave: 2~6).
 * If the exact same pitch is already playing, it will stop it (toggle behavior).
 */
export function playPitch(semitone, octave = 4, volume = 0.5, cancelSequence = true) {
  const ctx = getAudioContext();
  if (!ctx) return null;

  // Toggle off if clicking the currently playing note
  if (currentPlaying && !currentPlaying.isChord && currentPlaying.semitone === semitone && currentPlaying.octave === octave) {
    stopPitch(cancelSequence);
    return null;
  }

  // Stop any previous note cleanly
  stopPitch(cancelSequence);

  const noteInfo = NOTES.find((n) => n.semitone === semitone) || NOTES[0];
  const freq = getNoteFrequency(semitone, octave);

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  // Gentle attack to avoid clicking
  masterGain.gain.exponentialRampToValueAtTime(Math.max(0.05, Math.min(1.0, volume)), now + 0.05);

  // Warm acoustic vocal-pipe timbre using fundamental + harmonics + gentle lowpass
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, now);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, now);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.28, now);
  osc2.connect(gain2);

  const osc3 = ctx.createOscillator();
  osc3.type = 'triangle';
  osc3.frequency.setValueAtTime(freq * 3, now);
  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(0.12, now);
  osc3.connect(gain3);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, now);

  osc1.connect(filter);
  gain2.connect(filter);
  gain3.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc3.start(now);

  currentOscillators = [osc1, osc2, osc3];
  currentGainNode = masterGain;

  currentPlaying = {
    isChord: false,
    semitone,
    octave,
    note: `${noteInfo.note}${octave}`,
    displayNote: `${noteInfo.note}${noteInfo.alt ? `/${noteInfo.alt}` : ''}${octave}`,
    koreanNote: `${noteInfo.korean}${octave}`,
    label: `${noteInfo.note}${noteInfo.alt ? `/${noteInfo.alt}` : ''} (${noteInfo.korean})`,
    freq,
    noteInfo,
  };

  notifyStateChange();
  return currentPlaying;
}

const NOTE_LOOKUP = {
  'C': 0, 'B#': 0, 'B♯': 0,
  'C#': 1, 'C♯': 1, 'DB': 1, 'D♭': 1,
  'D': 2,
  'D#': 3, 'D♯': 3, 'EB': 3, 'E♭': 3,
  'E': 4, 'FB': 4, 'F♭': 4,
  'F': 5, 'E#': 5, 'E♯': 5,
  'F#': 6, 'F♯': 6, 'GB': 6, 'G♭': 6,
  'G': 7,
  'G#': 8, 'G♯': 8, 'AB': 8, 'A♭': 8,
  'A': 9,
  'A#': 10, 'A♯': 10, 'BB': 10, 'B♭': 10,
  'B': 11, 'CB': 11, 'C♭': 11,
};

const SOLFEGE_MAP = {
  'C': '도', 'D': '레', 'E': '미', 'F': '파', 'G': '솔', 'A': '라', 'B': '시',
};

/**
 * Parse standard note string into musical note descriptor.
 * Supports "Ab4", "A♭4", "F#3", "F♯3", "C4", "Bb2", etc.
 */
export function parseNoteString(noteStr) {
  if (!noteStr || typeof noteStr !== 'string') return null;
  const clean = noteStr.trim();
  const match = clean.match(/^([A-Ga-g])([#♯b♭]?)(-?\d+)?$/);
  if (!match) return null;

  const root = match[1].toUpperCase();
  const rawAcc = match[2] || '';
  const acc = rawAcc.replace('♯', '#').replace('♭', 'b').toLowerCase();
  const octave = match[3] !== undefined ? parseInt(match[3], 10) : 4;
  const lookupKey = `${root}${rawAcc.toUpperCase().replace('♯', '#').replace('♭', 'B')}`;
  const semitone = NOTE_LOOKUP[lookupKey];
  if (semitone === undefined) return null;

  const noteInfo = NOTES.find((n) => n.semitone === semitone) || NOTES[0];
  const freq = getNoteFrequency(semitone, octave);

  const displayAcc = acc === 'b' ? '♭' : (acc === '#' ? '♯' : '');
  const displayNote = `${root}${displayAcc}${octave}`;
  const koreanNote = `${SOLFEGE_MAP[root] || ''}${displayAcc}${octave}`;

  return {
    raw: clean,
    root,
    acc,
    octave,
    semitone,
    freq,
    displayNote,
    koreanNote,
    label: `${displayNote} (${koreanNote})`,
    noteInfo,
  };
}

/**
 * Play note from string (e.g. "Ab4", "Eb5", "F#3").
 * Toggles off if this note is already playing.
 */
export function playNoteString(noteStr, volume = 0.5, cancelSequence = true) {
  const parsed = parseNoteString(noteStr);
  if (!parsed) return null;

  if (currentPlaying && !currentPlaying.isChord && currentPlaying.semitone === parsed.semitone && currentPlaying.octave === parsed.octave) {
    stopPitch(cancelSequence);
    return null;
  }

  const played = playPitch(parsed.semitone, parsed.octave, volume, cancelSequence);
  if (played) {
    played.raw = noteStr;
    played.displayNote = parsed.displayNote;
    played.koreanNote = parsed.koreanNote;
    played.label = parsed.label;
    notifyStateChange();
  }
  return played;
}

/**
 * Play all starting notes in harmony simultaneously (A cappella starting chord).
 * Toggles off if chord is already playing.
 */
export function playChordStrings(notesList, volume = 0.38, cancelSequence = true) {
  const ctx = getAudioContext();
  if (!ctx) return null;

  if (currentPlaying && currentPlaying.isChord) {
    stopPitch(cancelSequence);
    return null;
  }

  stopPitch(cancelSequence);

  const parsedList = (Array.isArray(notesList) ? notesList : [])
    .map((s) => parseNoteString(s))
    .filter(Boolean);

  if (!parsedList.length) return null;

  // De-duplicate by semitone + octave
  const seen = new Set();
  const uniqueNotes = [];
  for (const item of parsedList) {
    const key = `${item.semitone}-${item.octave}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueNotes.push(item);
    }
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  const scaledVol = Math.min(0.55, volume / Math.sqrt(uniqueNotes.length));
  masterGain.gain.exponentialRampToValueAtTime(scaledVol, now + 0.08);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, now);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  const oscillators = [];

  uniqueNotes.forEach((parsed) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(parsed.freq, now);

    const oscHarm = ctx.createOscillator();
    oscHarm.type = 'sine';
    oscHarm.frequency.setValueAtTime(parsed.freq * 2, now);
    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.2, now);
    oscHarm.connect(harmGain);
    harmGain.connect(filter);

    osc.connect(filter);
    osc.start(now);
    oscHarm.start(now);
    oscillators.push(osc, oscHarm);
  });

  currentOscillators = oscillators;
  currentGainNode = masterGain;

  currentPlaying = {
    isChord: true,
    notes: uniqueNotes.map((p) => p.displayNote),
    label: `화음 (${uniqueNotes.map((p) => p.displayNote).join(' · ')})`,
  };

  notifyStateChange();
  return currentPlaying;
}

export function getCurrentPlaying() {
  return currentPlaying;
}

/**
 * Play starting pitches sequentially (arpeggio from bass to soprano),
 * followed by all parts sounding together as a starting harmony chord.
 */
export function playPitchSequence(items, options = {}) {
  const ctx = getAudioContext();
  if (!ctx) return null;

  // Toggle off if sequence is already actively playing
  if (currentSequence) {
    stopPitchSequence();
    return null;
  }

  stopPitch(true);

  const noteDuration = options.noteDuration || 850;
  const gapDuration = options.gapDuration || 140;
  const chordDuration = options.chordDuration || 2600;
  const onStep = options.onStep;

  // Normalize items to objects with parsed note info
  const rawList = Array.isArray(items) ? items : [];
  const validItems = [];
  rawList.forEach((it) => {
    if (!it) return;
    if (typeof it === 'string') {
      const parsed = parseNoteString(it);
      if (parsed) validItems.push({ noteStr: it, parsed, label: it });
    } else if (typeof it === 'object') {
      const parsed = it.parsed || (it.noteStr ? parseNoteString(it.noteStr) : null);
      if (parsed) validItems.push({ ...it, parsed, noteStr: it.noteStr || parsed.displayNote });
    }
  });

  if (!validItems.length) return null;

  // Sort ascending by frequency (Low bass -> high soprano arpeggio)
  const sorted = [...validItems].sort((a, b) => a.parsed.freq - b.parsed.freq);

  currentSequence = {
    isPlaying: true,
    index: 0,
    total: sorted.length,
    sorted,
    onStep,
  };

  let currentIndex = 0;

  function runNext() {
    if (!currentSequence) return;
    if (sequenceTimer) {
      clearTimeout(sequenceTimer);
      sequenceTimer = null;
    }

    if (currentIndex < sorted.length) {
      const item = sorted[currentIndex];
      currentSequence.index = currentIndex;
      currentSequence.currentItem = item;

      stopPitch(false);
      const played = playPitch(item.parsed.semitone, item.parsed.octave, 0.5, false);
      if (played) {
        played.raw = item.noteStr;
        played.displayNote = item.parsed.displayNote;
        played.koreanNote = item.parsed.koreanNote;
        played.label = `${item.label ? `${item.label} ` : ''}${item.parsed.label}`;
        notifyStateChange();
      }

      if (typeof onStep === 'function') {
        try {
          onStep({
            type: 'note',
            index: currentIndex,
            total: sorted.length,
            item,
            noteStr: item.noteStr,
            parsed: item.parsed,
            label: item.label
          });
        } catch (e) {
          console.error(e);
        }
      }

      sequenceTimer = setTimeout(() => {
        if (!currentSequence) return;
        stopPitch(false);

        sequenceTimer = setTimeout(() => {
          if (!currentSequence) return;
          currentIndex++;
          runNext();
        }, gapDuration);
      }, noteDuration);

    } else if (currentIndex === sorted.length) {
      // Step: Play Full Choral Chord
      currentSequence.isChordPhase = true;
      currentSequence.currentItem = null;
      const allNotes = sorted.map((it) => it.noteStr);

      stopPitch(false);
      playChordStrings(allNotes, 0.42, false);

      if (typeof onStep === 'function') {
        try {
          onStep({
            type: 'chord',
            notes: allNotes,
            duration: chordDuration,
            items: sorted
          });
        } catch (e) {
          console.error(e);
        }
      }

      sequenceTimer = setTimeout(() => {
        const prevSeq = currentSequence;
        currentSequence = null;
        sequenceTimer = null;
        stopPitch(false);
        if (prevSeq && typeof prevSeq.onStep === 'function') {
          try {
            prevSeq.onStep({ type: 'finish', stoppedEarly: false });
          } catch (e) {
            console.error(e);
          }
        }
      }, chordDuration);
    }
  }

  runNext();
  return currentSequence;
}


