import fs from 'fs';
import path from 'path';

const rootDir = 'C:/Users/user/Desktop/한국아카펠라교육연구회 악보';

function walk(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(fullPath));
    } else if (entry.isFile()) {
      files.push({
        fullPath,
        relPath: path.relative(rootDir, fullPath),
        name: entry.name,
        ext: path.extname(entry.name).toLowerCase(),
        size: fs.statSync(fullPath).size
      });
    }
  }
  return files;
}

const allFiles = walk(rootDir);
console.log('Total files found:', allFiles.length);

const extCounts = {};
for (const f of allFiles) {
  extCounts[f.ext] = (extCounts[f.ext] || 0) + 1;
}
console.log('Extension counts:', extCounts);

const folderCounts = {};
for (const f of allFiles) {
  const topFolder = f.relPath.split(path.sep)[0] || 'root';
  folderCounts[topFolder] = (folderCounts[topFolder] || 0) + 1;
}
console.log('Folder counts:', folderCounts);
