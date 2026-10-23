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
    // suspend→resume은 일부 인앱 브라우저(카카오톡 등)에서 다시 깨어나지 않아 소리가 안 나는 문제가 있어
    // 쉬는 동안에는 소리 엔진을 완전히 닫고, 다음에 누를 때 새로 만든다 (오디오 점유도 바로 해제됨)
    if (audioCtx && !currentPlaying && !currentSequence) {
      const old = audioCtx;
      audioCtx = null;
      try { if (typeof old.close === 'function') Promise.resolve(old.close()).catch(() => {}); } catch {}
    }
  }, delay);
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  useMixableAudioSession();
  if (idleSuspendTimer) { clearTimeout(idleSuspendTimer); idleSuspendTimer = null; }
  // 닫혔거나(iOS 'interrupted' 포함) 멈춘 채 깨어나지 않는 엔진은 버리고 새로 만든다
  if (audioCtx && (audioCtx.state === 'closed' || audioCtx.state === 'interrupted')) audioCtx = null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try { audioCtx = new AudioContextClass(); } catch { audioCtx = null; }
    }
  }
  if (audioCtx && audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
    Promise.resolve(audioCtx.resume()).catch(() => {});
  }
  return audioCtx;
}

// 첫 음 전체 볼륨: 찢어짐(포화) 없이 깨끗하게 키움.
// 단음 최고치가 약 0.8이 되도록 증폭하고, 화음 등 겹친 소리는 리미터가 부드럽게 눌러 줌
const OUTPUT_BOOST = 1.45;
// 단음용 깨끗한 출력: 리미터 없이 일정 배율만 적용
const SINGLE_NOTE_GAIN = 1.0;
function getCleanOutputNode(ctx) {
  if (ctx.__acaClean) return ctx.__acaClean;
  let node = ctx.destination;
  try {
    const g = ctx.createGain();
    if (typeof g.gain.setValueAtTime === 'function') g.gain.setValueAtTime(SINGLE_NOTE_GAIN, ctx.currentTime); else g.gain.value = SINGLE_NOTE_GAIN;
    g.connect(node);
    node = g;
  } catch {}
  ctx.__acaClean = node;
  return node;
}

function getOutputNode(ctx) {
  if (ctx.__acaOutput) return ctx.__acaOutput;
  let node = ctx.destination;
  const set = (param, v) => { if (!param) return; if (typeof param.setValueAtTime === 'function') param.setValueAtTime(v, ctx.currentTime); else param.value = v; };
  try {
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const limiter = ctx.createDynamicsCompressor();
      set(limiter.threshold, -1.5);
      set(limiter.knee, 6);
      set(limiter.ratio, 12);
      set(limiter.attack, 0.008);
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
  stopFallbackAudio();
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
// ───────────────────────────────────────────────────────────────
// 인앱 브라우저(카카오톡·네이버·인스타그램 등)나 Web Audio가 깨어나지 않는 환경을 위한 대체 재생.
// 첫 음을 즉석에서 WAV 파일로 만들어 일반 <audio>로 재생한다 (터치 직후 바로 재생되어 막히지 않음).
// ───────────────────────────────────────────────────────────────
const IN_APP_UA = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i;
let webAudioBroken = false;
try { webAudioBroken = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('aca_webaudio_broken') === '1'; } catch {}
let fallbackAudio = null;

function shouldUseFallback() {
  if (typeof window === 'undefined') return false;
  if (!(window.AudioContext || window.webkitAudioContext)) return true;
  if (webAudioBroken) return true;
  return typeof navigator !== 'undefined' && IN_APP_UA.test(navigator.userAgent || '');
}
function markWebAudioBrokenIfSilent(ctx) {
  if (!ctx || typeof setTimeout === 'undefined') return;
  setTimeout(() => {
    if (ctx.state && ctx.state !== 'running' && ctx.state !== 'closed') {
      webAudioBroken = true;
      try { sessionStorage.setItem('aca_webaudio_broken', '1'); } catch {}
    }
  }, 400);
}
function stopFallbackAudio() {
  if (!fallbackAudio) return;
  try { fallbackAudio.pause(); } catch {}
  fallbackAudio = null;
}
// voices: [{ freq, weight, harmonics: [h1, h2, ...] }]
function playFallbackTones(voices, durationMs, peakTarget = 0.7) {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
  stopFallbackAudio();
  const rate = 22050;
  const dur = Math.min(Math.max(durationMs || 3000, 300), 6000) / 1000;
  const n = Math.floor(rate * (dur + 0.15));
  const data = new Float32Array(n);
  const attack = 0.03 * rate, release = 0.15 * rate, end = Math.floor(dur * rate);
  voices.forEach((v, vi) => {
    const offset = Math.floor(vi * 0.0037 * rate);
    for (let i = offset; i < n; i++) {
      const tt = (i - offset) / rate;
      let s = 0;
      v.harmonics.forEach((h, k) => { if (h) s += h * Math.sin(2 * Math.PI * v.freq * (k + 1) * tt); });
      let env = 1;
      if (i - offset < attack) env = (i - offset) / attack;
      if (i > end) env *= Math.max(0, 1 - (i - end) / release);
      data[i] += s * v.weight * env;
    }
  });
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? peakTarget / peak : 0;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i] * scale)) * 32767, true);
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  const audio = new Audio(url);
  audio.volume = 1;
  audio.addEventListener('ended', () => { URL.revokeObjectURL(url); if (fallbackAudio === audio) fallbackAudio = null; }, { once: true });
  fallbackAudio = audio;
  const pr = audio.play();
  if (pr && typeof pr.catch === 'function') pr.catch(() => {});
  return true;
}
function lowNoteRecipe(freq) {
  if (freq < 230) {
    // 낮을수록 기본음을 더 줄임 (F3≈175Hz, F2≈87Hz)
    const k = Math.max(0, Math.min(1, (230 - freq) / 140));
    return { isLow: true, h: [0.55 - 0.25 * k, 0.6, 0.42, 0.22], level: 0.8 - 0.08 * k };
  }
  return { isLow: false, h: [1, 0.28, 0.12, 0], level: 1 };
}

function chordVoices(notes) {
  return notes.map((p) => {
    const isBass = p.freq < 165;
    const harmonics = isBass ? [1, 0.8, 0.6, 0.38, 0.2] : [1, 0.32, 0.14];
    const sum = harmonics.reduce((s, g) => s + g, 0);
    return { freq: p.freq, harmonics, weight: (isBass ? 1.3 : p.freq > 420 ? 0.72 : p.freq > 300 ? 0.88 : 1) / sum };
  });
}

export function playPitch(semitone, octave = 4, volume = 0.5, cancelSequence = true, duration = DEFAULT_PITCH_DURATION, meta = null) {
  const useFallback = shouldUseFallback();
  const ctx = useFallback ? null : getAudioContext();
  if (!ctx && !useFallback) return null;

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

  if (useFallback) {
    const lowR = lowNoteRecipe(freq);
    playFallbackTones([{ freq, weight: lowR.level, harmonics: lowR.h }], duration > 0 ? duration : 3000, lowR.isLow ? 0.6 : 0.75);
    return finishPitchStart(semitone, octave, noteInfo, freq, duration, meta);
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  if (typeof masterGain.gain.setValueAtTime === 'function') {
    masterGain.gain.setValueAtTime(0.0001, now);
  }
  // 낮은 음(약 230Hz 미만)은 휴대폰 스피커가 기본음을 감당하지 못해 '찢어지는' 소리가 나므로
  // 기본음을 줄이고 배음을 키워 같은 음으로 들리면서 스피커 떨림을 막는다
  const low = lowNoteRecipe(freq);
  // Gentle attack to avoid clicking
  safeRampToValue(masterGain.gain, Math.max(0.05, Math.min(1.0, volume * low.level)), now + 0.05);

  // Warm acoustic vocal-pipe timbre using fundamental + harmonics + gentle lowpass
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, now);
  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(low.h[0], now);
  osc1.connect(gain1);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, now);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(low.h[1], now);
  osc2.connect(gain2);

  const osc3 = ctx.createOscillator();
  osc3.type = low.isLow ? 'sine' : 'triangle';
  osc3.frequency.setValueAtTime(freq * 3, now);
  const gain3 = ctx.createGain();
  gain3.gain.setValueAtTime(low.h[2], now);
  osc3.connect(gain3);

  const osc4 = ctx.createOscillator();
  osc4.type = 'sine';
  osc4.frequency.setValueAtTime(freq * 4, now);
  const gain4 = ctx.createGain();
  gain4.gain.setValueAtTime(low.h[3], now);
  osc4.connect(gain4);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, now);
  // 휴대폰 스피커가 낼 수 없는 초저음은 미리 걸러 떨림(찢어짐) 방지
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(110, now);

  gain1.connect(filter);
  gain2.connect(filter);
  gain3.connect(filter);
  gain4.connect(filter);
  filter.connect(hp);
  hp.connect(masterGain);
  // 단음은 리미터를 거치지 않고 바로 출력 (리미터가 낮은 음의 파형을 일그러뜨려 '깨지는' 소리가 났음)
  masterGain.connect(getCleanOutputNode(ctx));

  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  osc4.start(now);

  currentOscillators = [osc1, osc2, osc3, osc4];
  currentGainNode = masterGain;

  markWebAudioBrokenIfSilent(ctx);
  return finishPitchStart(semitone, octave, noteInfo, freq, duration, meta);
}

function finishPitchStart(semitone, octave, noteInfo, freq, duration, meta) {
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
  const useFallback = shouldUseFallback();
  const ctx = useFallback ? null : getAudioContext();
  if (!ctx && !useFallback) return null;

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

  if (useFallback) {
    playFallbackTones(chordVoices(uniqueNotes), duration > 0 ? duration : 3000);
    currentOscillators = [];
    currentGainNode = null;
    currentPlaying = {
      isChord: true,
      notes: uniqueNotes.map((p) => p.displayNote),
      label: `화음 (${uniqueNotes.map((p) => p.displayNote).join(' · ')})`,
    };
    if (duration > 0) {
      singlePitchTimer = setTimeout(() => { singlePitchTimer = null; stopPitch(false); }, duration);
    }
    notifyStateChange();
    return currentPlaying;
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  if (typeof masterGain.gain.setValueAtTime === 'function') {
    masterGain.gain.setValueAtTime(0.0001, now);
  }
  const scaledVol = Math.min(0.37, (volume * 0.82) / Math.pow(uniqueNotes.length, 0.62));
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
  markWebAudioBrokenIfSilent(ctx);

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



/** 피치파이프 대표음 표시용 정보 (옥타브 없이) */
export function pitchPipeInfo(note) {
  const parsed = typeof note === 'string' && note ? parseNoteString(`${note}4`) : null;
  if (!parsed) return null;
  return {
    note,
    display: parsed.displayNote.replace(/\d+$/, ''),
    korean: parsed.koreanNote.replace(/\d+$/, ''),
  };
}

/** 피치파이프 대표음 1.5초 재생 */
export function playPitchPipe(note) {
  if (isPitchSequencePlaying()) stopPitchSequence();
  return playNoteString(`${note}4`, 0.5, true, 1500);
}
