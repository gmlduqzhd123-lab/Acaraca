// data/*.json에 등록된 YouTube 영상이 아직 재생 가능한지 YouTube oEmbed로 확인한다.
// 네트워크가 필요하므로 PR 검사(ci.yml)가 아니라 주 1회 예약 검사(link-check.yml)와 수동 실행에서만 쓴다.
//   npm run check-links
// 영상 주소가 담긴 칸(url, videoUrl)만 본다. 설명 글 속 링크는 검사하지 않는다.
//   404 / 401 : 삭제·비공개 영상 → 실패
//   403       : 퍼가기(임베드) 금지 영상 → 앱 안에서 재생되지 않으므로 실패
//   429 / 5xx / 네트워크 오류 : 일시적일 수 있어 경고만 (재시도 후)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ID_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/;
const URL_KEYS = new Set(['url', 'videoUrl']);

function collect() {
  const found = new Map(); // videoId -> Set of "file:item-id"
  for (const file of fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))) {
    const walk = (node, ctx) => {
      if (Array.isArray(node)) { node.forEach((x) => walk(x, ctx)); return; }
      if (!node || typeof node !== 'object') return;
      const here = typeof node.id === 'string' ? node.id : ctx;
      for (const [key, value] of Object.entries(node)) {
        if (typeof value === 'string' && URL_KEYS.has(key)) {
          const m = value.match(ID_RE);
          if (m) {
            if (!found.has(m[1])) found.set(m[1], new Set());
            found.get(m[1]).add(`${file}:${here}`);
          }
        } else if (value && typeof value === 'object') {
          walk(value, here);
        }
      }
    };
    walk(JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')), file);
  }
  return found;
}

async function status(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status !== 429 && res.status < 500) return res.status;
    } catch {
      // 네트워크 오류 → 재시도
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return 0; // 끝내 확인 못 함
}

(async () => {
  const videos = collect();
  const ids = [...videos.keys()];
  const results = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      results.set(id, await status(id));
    }
  }));

  const broken = ids.filter((id) => [401, 403, 404].includes(results.get(id)));
  const unknown = ids.filter((id) => ![200, 401, 403, 404].includes(results.get(id)));
  const where = (id) => [...videos.get(id)].join(', ');
  const reason = { 401: '비공개', 403: '퍼가기 금지', 404: '삭제됨' };

  console.log(`YouTube 영상 ${ids.length}개 확인: 정상 ${ids.length - broken.length - unknown.length}, 문제 ${broken.length}, 확인 불가 ${unknown.length}`);
  for (const id of unknown) console.warn(`⚠ 확인 불가(HTTP ${results.get(id) || '오류'}) ${id} ← ${where(id)}`);
  for (const id of broken) console.error(`✗ ${reason[results.get(id)]} https://youtu.be/${id} ← ${where(id)}`);
  if (broken.length) process.exit(1);
})();
