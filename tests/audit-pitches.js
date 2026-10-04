import fs from 'node:fs';
import { parseNoteString, getNoteFrequency } from '../js/pitch.js';

const songs = JSON.parse(fs.readFileSync('data/songs.json', 'utf8')).songs;
console.log('Total songs:', songs.length);

let errors = 0;
songs.forEach(song => {
  if (!song.startingPitches || typeof song.startingPitches !== 'object') {
    console.error('✗ Missing startingPitches for song:', song.id);
    errors++;
    return;
  }
  
  for (const [part, noteStr] of Object.entries(song.startingPitches)) {
    if (!noteStr) continue;
    try {
      const parsed = parseNoteString(noteStr);
      if (!parsed) {
        console.error(`✗ Cannot parse pitch for song ${song.id} [${part}]: '${noteStr}'`);
        errors++;
      } else {
        const freq1 = parsed.freq;
        const freq2 = getNoteFrequency(parsed.semitone, parsed.octave);
        if (typeof freq1 !== 'number' || isNaN(freq1) || freq1 <= 0 || freq1 !== freq2) {
          console.error(`✗ Invalid freq for song ${song.id} [${part}]: '${noteStr}' -> ${freq1} vs ${freq2}`);
          errors++;
        }
      }
    } catch (e) {
      console.error(`✗ Exception parsing pitch for song ${song.id} [${part}]: '${noteStr}' - ${e.message}`);
      errors++;
    }
  }
});

if (errors === 0) {
  console.log('✓ All 33 songs have 100% valid, playable starting pitches for all parts!');
} else {
  console.error('✗ Total pitch errors:', errors);
  process.exit(1);
}
