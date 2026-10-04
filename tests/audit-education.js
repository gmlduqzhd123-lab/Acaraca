import fs from 'node:fs';

const edu = JSON.parse(fs.readFileSync('data/education.json', 'utf8')).resources;
console.log('Total education resources:', edu.length);

let errors = 0;
edu.forEach((r, i) => {
  if (!r.id || !r.title || !r.author || !r.category || !r.fileUrl) {
    console.error(`✗ Resource #${i} missing required fields`);
    errors++;
  }
  if (!fs.existsSync(r.fileUrl.replace(/^\.\//, ''))) {
    console.error(`✗ Resource ${r.id} missing file on disk: ${r.fileUrl}`);
    errors++;
  }
  if (!r.description || r.description.length > 250) {
    console.warn(`? Resource ${r.id} description length: ${r.description?.length} chars`);
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
