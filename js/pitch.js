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
let onStateChangeCallback = null;

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
  onStateChangeCallback = callback;
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
  if (typeof onStateChangeCallback === 'function') {
    onStateChangeCallback(currentPlaying);
  }
}

/**
 * Stop any currently sounding pitch.
 */
export function stopPitch() {
  if (currentGainNode && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      currentGainNode.gain.cancelScheduledValues(now);
      currentGainNode.gain.setValueAtTime(currentGainNode.gain.value, now);
      currentGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      setTimeout(() => {
        for (const osc of currentOscillators) {
          try { osc.stop(); osc.disconnect(); } catch {}
        }
        currentOscillators = [];
        currentGainNode = null;
      }, 150);
    } catch {
      currentOscillators = [];
      currentGainNode = null;
    }
  } else {
    currentOscillators = [];
    currentGainNode = null;
  }
  currentPlaying = null;
  notifyStateChange();
}

/**
 * Play a specific pitch (semitone: 0~11, octave: 3~5).
 * If the exact same pitch is already playing, it will stop it (toggle behavior).
 */
export function playPitch(semitone, octave = 4, volume = 0.5) {
  const ctx = getAudioContext();
  if (!ctx) return null;

  // Toggle off if clicking the currently playing note
  if (currentPlaying && currentPlaying.semitone === semitone && currentPlaying.octave === octave) {
    stopPitch();
    return null;
  }

  // Stop any previous note cleanly
  stopPitch();

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
    semitone,
    octave,
    note: `${noteInfo.note}${octave}`,
    label: `${noteInfo.note}${noteInfo.alt ? `/${noteInfo.alt}` : ''} (${noteInfo.korean})`,
    freq,
    noteInfo,
  };

  notifyStateChange();
  return currentPlaying;
}

export function getCurrentPlaying() {
  return currentPlaying;
}
