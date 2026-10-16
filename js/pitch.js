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

// 첫 음 소리는 다른 앱(음성 녹음 앱 등)을 끊지 않고 섞여서 나오도록 'ambient' 오디오 세션 사용
// (iOS Safari 16.4+ Audio Session API. 지원하지 않는 브라우저에서는 무시됨)
export function useMixableAudioSession() {
  try {
    if (typeof navigator !== 'undefined' && navigator.audioSession && navigator.audioSession.type !== 'ambient') {
      navigator.audioSession.type = 'ambient';
    }
  } catch {}
}

// 소리가 끝나면 AudioContext를 잠시 쉬게 해서 기기의 오디오 점유(오디오 포커스)를 바로 놓아 줌
let idleSuspendTimer = null;
function scheduleIdleSuspend(delay = 1200) {
  if (typeof window === 'undefined') return;
  if (idleSuspendTimer) clearTimeout(idleSuspendTimer);
  idleSuspendTimer = setTimeout(() => {
    idleSuspendTimer = null;
    if (audioCtx && audioCtx.state === 'running' && typeof audioCtx.suspend === 'function' && !currentPlaying && !currentSequence) {
      Promise.resolve(audioCtx.suspend()).catch(() => {});
    }
  }, delay);
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  useMixableAudioSession();
  if (idleSuspendTimer) { clearTimeout(idleSuspendTimer); idleSuspendTimer = null; }
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

// 첫 음 전체 볼륨: 찢어짐(포화) 없이 깨끗하게 키움.
// 단음 최고치가 약 0.8이 되도록 증폭하고, 화음 등 겹친 소리는 리미터가 부드럽게 눌러 줌
const OUTPUT_BOOST = 1.45;
function getOutputNode(ctx) {
  if (ctx.__acaOutput) return ctx.__acaOutput;
  let node = ctx.destination;
  const set = (param, v) => { if (!param) return; if (typeof param.setValueAtTime === 'function') param.setValueAtTime(v, ctx.currentTime); else param.value = v; };
  try {
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const limiter = ctx.createDynamicsCompressor();
      set(limiter.threshold, -6);
      set(limiter.knee, 6);
      set(limiter.ratio, 12);
      set(limiter.attack, 0.002);
      set(limiter.release, 0.25);
      limiter.connect(node);
      node = limiter;
    }
    const boost = ctx.createGain();
    set(boost.gain, OUTPUT_BOOST);
    boost.connect(node);
    node = boost;
  } catch {}
  ctx.__acaOutput = node;
  return node;
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
  scheduleIdleSuspend();
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    unlockAudioContext();
  };
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
  window.addEventListener('click', unlock, { once: true, passive: true });
}

function notifyStateChange() {
  if (!currentPlaying && !currentSequence) scheduleIdleSuspend();
  for (const listener of stateListeners) {
    try {
      listener(currentPlaying);
    } catch (e) {
      console.error(e);
    }
  }
}

function safeRampToValue(gainParam, targetValue, targetTime) {
  if (!gainParam) return;
  if (typeof gainParam.linearRampToValueAtTime === 'function') {
    gainParam.linearRampToValueAtTime(targetValue, targetTime);
  } else if (typeof gainParam.exponentialRampToValueAtTime === 'function' && targetValue > 0) {
    try {
      gainParam.exponentialRampToValueAtTime(targetValue, targetTime);
    } catch {
      if (typeof gainParam.setValueAtTime === 'function') {
        gainParam.setValueAtTime(targetValue, targetTime);
      }
    }
  } else if (typeof gainParam.setValueAtTime === 'function') {
    gainParam.setValueAtTime(targetValue, targetTime);
  } else {
    gainParam.value = targetValue;
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

export const DEFAULT_PITCH_DURATION = 3000;
let singlePitchTimer = null;

function clearSinglePitchTimer() {
  if (singlePitchTimer) {
    clearTimeout(singlePitchTimer);
    singlePitchTimer = null;
  }
}

export function isPitchPlaying() {
  return Boolean(currentPlaying || currentSequence);
}

/**
 * Stop any currently sounding pitch or chord.
 */
export function stopPitch(cancelSequence = true) {
  clearSinglePitchTimer();
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
    const closingGain = currentGainNode;
    const closingOscs = [...currentOscillators];
    currentOscillators = [];
    currentGainNode = null;
    try {
      const now = audioCtx.currentTime;
      if (typeof closingGain.gain.cancelScheduledValues === 'function') {
        closingGain.gain.cancelScheduledValues(now);
      }
      const curVal = Math.max(0.0001, closingGain.gain.value || 0.5);
      if (typeof closingGain.gain.setValueAtTime === 'function') {
        closingGain.gain.setValueAtTime(curVal, now);
      }
      safeRampToValue(closingGain.gain, 0, now + 0.08);
      for (const osc of closingOscs) {
        try { osc.stop(now + 0.09); } catch { try { osc.stop(); } catch {} }
      }
    } catch (e) {
      for (const osc of closingOscs) {
        try { osc.stop(); } catch {}
      }
    }
    setTimeout(() => {
      for (const osc of closingOscs) {
        try { osc.disconnect(); } catch {}
      }
    }, 150);
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
 * Auto-stops after `duration` ms (default 3000ms = 3초). Set duration=0 for indefinite.
 */
export function playPitch(semitone, octave = 4, volume = 0.5, cancelSequence = true, duration = DEFAULT_PITCH_DURATION, meta = null) {
  const ctx = getAudioContext();
  if (!ctx) return null;

  // Toggle off if clicking the currently playing note
  if (currentPlaying && !currentPlaying.isChord && currentPlaying.semitone === semitone && currentPlaying.octave === octave) {
    stopPitch(cancelSequence);
    return null;
  }

  // Stop any previous note cleanly
  stopPitch(cancelSequence);
  clearSinglePitchTimer();

  const noteInfo = NOTES.find((n) => n.semitone === semitone) || NOTES[0];
  const freq = getNoteFrequency(semitone, octave);

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  if (typeof masterGain.gain.setValueAtTime === 'function') {
    masterGain.gain.setValueAtTime(0.0001, now);
  }
  // Gentle attack to avoid clicking
  safeRampToValue(masterGain.gain, Math.max(0.05, Math.min(1.0, volume)), now + 0.05);

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
  masterGain.connect(getOutputNode(ctx));

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
    ...(meta && typeof meta === 'object' ? meta : {})
  };

  if (duration > 0) {
    singlePitchTimer = setTimeout(() => {
      singlePitchTimer = null;
      stopPitch(false);
    }, duration);
  }

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
export function playNoteString(noteStr, volume = 0.5, cancelSequence = true, duration = DEFAULT_PITCH_DURATION) {
  const parsed = parseNoteString(noteStr);
  if (!parsed) return null;

  if (currentPlaying && !currentPlaying.isChord && currentPlaying.semitone === parsed.semitone && currentPlaying.octave === parsed.octave) {
    stopPitch(cancelSequence);
    return null;
  }

  const played = playPitch(parsed.semitone, parsed.octave, volume, cancelSequence, duration);
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
 * Auto-stops after `duration` ms (default 3000ms = 3초). Set duration=0 for indefinite.
 */
export function playChordStrings(notesList, volume = 0.38, cancelSequence = true, duration = DEFAULT_PITCH_DURATION) {
  const ctx = getAudioContext();
  if (!ctx) return null;

  if (currentPlaying && currentPlaying.isChord) {
    stopPitch(cancelSequence);
    return null;
  }

  stopPitch(cancelSequence);
  clearSinglePitchTimer();

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
  if (typeof masterGain.gain.setValueAtTime === 'function') {
    masterGain.gain.setValueAtTime(0.0001, now);
  }
  const scaledVol = Math.min(0.3, (volume * 0.66) / Math.pow(uniqueNotes.length, 0.62));
  safeRampToValue(masterGain.gain, scaledVol, now + 0.15);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2400, now);
  filter.connect(masterGain);
  masterGain.connect(getOutputNode(ctx));

  const oscillators = [];

  // 모든 성부를 같은 '허밍' 음색으로 맞춰 하나로 섞이게 함.
  // 음마다 배음을 담은 파형(PeriodicWave) 오실레이터 1개만 사용 → 휴대폰에서도 가볍고 끊김·떨림 없음
  // 저음은 배음을 더 실어 휴대폰 스피커에서도 들리게, 높은 음은 살짝 줄여 균형을 맞춤
  uniqueNotes.forEach((parsed, idx) => {
    const f = parsed.freq;
    const isBass = f < 165;
    const harmonics = isBass ? [1, 0.8, 0.6, 0.38, 0.2] : [1, 0.32, 0.14];
    const harmSum = harmonics.reduce((s, g) => s + g, 0);
    const weight = (isBass ? 1.3 : f > 420 ? 0.72 : f > 300 ? 0.88 : 1) / harmSum * 1.2;
    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(weight, now);
    voiceGain.connect(filter);
    const osc = ctx.createOscillator();
    if (typeof ctx.createPeriodicWave === 'function') {
      const real = new Float32Array(harmonics.length + 1);
      const imag = new Float32Array([0, ...harmonics]);
      osc.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: true }));
    } else {
      osc.type = 'sine';
    }
    osc.frequency.setValueAtTime(f, now);
    osc.connect(voiceGain);
    // 모든 음이 같은 위상으로 동시에 시작하면 순간 최고치가 겹쳐 깨지므로 수 ms씩 엇갈려 시작
    osc.start(now + idx * 0.0037);
    oscillators.push(osc);
  });

  currentOscillators = oscillators;
  currentGainNode = masterGain;

  currentPlaying = {
    isChord: true,
    notes: uniqueNotes.map((p) => p.displayNote),
    label: `화음 (${uniqueNotes.map((p) => p.displayNote).join(' · ')})`,
  };

  if (duration > 0) {
    singlePitchTimer = setTimeout(() => {
      singlePitchTimer = null;
      stopPitch(false);
    }, duration);
  }

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

  // Keep caller order when requested; otherwise sort ascending by frequency (low -> high)
  const sorted = options.keepOrder
    ? [...validItems]
    : [...validItems].sort((a, b) => a.parsed.freq - b.parsed.freq);

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
      const played = playPitch(item.parsed.semitone, item.parsed.octave, 0.5, false, 0);
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
      playChordStrings(allNotes, 0.42, false, 0);

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

/**
 * Global blank-area tap-to-mute listener
 * Touching or clicking anywhere outside pitch buttons immediately silences any playing pitch/chord/sequence.
 */
const PITCH_TRIGGER_SELECTORS = [
  '.stage-overview-pitch-chip',
  '.stage-overview-chord-btn',
  '.stage-part-sound-btn',
  '.stage-pitch-play-all-btn',
  '.part-pitch-chip',
  '.seq-play-btn',
  '.chord-play-btn',
  '.stop-pitch-btn',
  '.pitch-key',
  '.pitch-note-btn',
  '.pitch-chord-btn',
  '.pitch-play-btn',
  '.pitch-arpeggio-btn',
  '[data-pitch-trigger]'
].join(', ');

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pointerdown', (e) => {
    if (!currentPlaying && !currentSequence) return;
    const targetEl = e.target && e.target.nodeType === 1
      ? e.target
      : (e.target ? e.target.parentElement : null);
    const isPitchTrigger = targetEl && typeof targetEl.closest === 'function'
      ? Boolean(targetEl.closest(PITCH_TRIGGER_SELECTORS))
      : false;

    if (!isPitchTrigger) {
      stopPitch(true);
      stopPitchSequence();
    }
  }, true);
}


