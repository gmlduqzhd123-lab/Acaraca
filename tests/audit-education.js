import fs from 'node:fs';
import { parseYouTube } from '../js/player.js';

const edu = JSON.parse(fs.readFileSync('data/education.json', 'utf8')).resources;
console.log('Total education resources:', edu.length);

let errors = 0;
edu.forEach((r, i) => {
  if (!r.id || !r.title || !r.author || !r.category || !r.fileUrl) {
    console.error(`✗ Resource #${i} missing required fields`);
    errors++;
  }
  if (r.format === 'video' || (r.fileUrl && (r.fileUrl.startsWith('http://') || r.fileUrl.startsWith('https://')))) {
    const videoUrl = r.videoUrl || r.fileUrl;
    const parsed = parseYouTube({ type: 'video', url: videoUrl });
    if (!parsed.ok) {
      console.error(`✗ Resource ${r.id} cannot parse videoUrl: '${videoUrl}'`);
      errors++;
    }
    if (!r.thumbnail || !r.thumbnail.startsWith('https://')) {
      console.error(`✗ Resource ${r.id} missing valid thumbnail: '${r.thumbnail}'`);
      errors++;
    }
  } else {
    if (!fs.existsSync(r.fileUrl.replace(/^\.\//, ''))) {
      console.error(`✗ Resource ${r.id} missing file on disk: ${r.fileUrl}`);
      errors++;
    }
  }
  if (!r.description || r.description.length > 250) {
    console.warn(`? Resource ${r.id} description length: ${r.description?.length} chars`);
    if (r.description && r.description.length > 250) {
      console.error(`✗ Resource ${r.id} description exceeds 250 chars (${r.description.length})`);
      errors++;
    }
  }
  if (!Array.isArray(r.tags) || r.tags.length === 0) {
    console.error(`✗ Resource ${r.id} has invalid tags`);
    errors++;
  }
});


if (errors === 0) {
  console.log(`✓ All ${edu.length} education resources have 100% valid schema, existing files on disk, and concise descriptions!`);
} else {
  console.error(`✗ Total education errors: ${errors}`);
  process.exit(1);
}
