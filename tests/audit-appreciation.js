import fs from 'node:fs';
import { parseYouTube } from '../js/player.js';

const apprec = JSON.parse(fs.readFileSync('data/appreciation.json', 'utf8')).videos;
const songIds = new Set(JSON.parse(fs.readFileSync('data/songs.json', 'utf8')).songs.map(s => s.id));

console.log('Total appreciation videos:', apprec.length);

let errors = 0;
const validCategories = new Set(['연습곡', '국내 아카펠라', '해외 명작', '보컬 커버', '라이브 콘서트', '영화 / OST']);

apprec.forEach((v, i) => {
  if (!v.id) {
    console.error(`✗ Video #${i} missing id`);
    errors++;
  }
  if (!v.title) {
    console.error(`✗ Video ${v.id} missing title`);
    errors++;
  }
  if (!v.category || !validCategories.has(v.category)) {
    console.error(`✗ Video ${v.id} invalid category: '${v.category}'`);
    errors++;
  }
  if (!v.videoUrl) {
    console.error(`✗ Video ${v.id} missing videoUrl`);
    errors++;
  } else {
    const parsed = parseYouTube({ type: 'video', url: v.videoUrl });
    if (!parsed.ok) {
      console.error(`✗ Video ${v.id} cannot parse videoUrl: '${v.videoUrl}'`);
      errors++;
    }
  }
  if (!v.thumbnail || !v.thumbnail.startsWith('https://')) {
    console.error(`✗ Video ${v.id} invalid thumbnail: '${v.thumbnail}'`);
    errors++;
  }
  if (v.songId && !songIds.has(v.songId)) {
    console.error(`✗ Video ${v.id} references non-existent songId: '${v.songId}'`);
    errors++;
  }
});

if (errors === 0) {
  console.log(`✓ All ${apprec.length} appreciation videos have 100% valid schema, categories, YouTube URLs, thumbnails, and song references!`);
} else {
  console.error(`✗ Total appreciation errors: ${errors}`);
  process.exit(1);
}
