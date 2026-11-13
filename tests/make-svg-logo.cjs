const fs = require('fs');
// 화면 표시용(최대 42px) 로고라 원본(logo.jpg, 1024px) 대신 256px 축소본을 넣어 용량을 줄인다.
const imgBase64 = fs.readFileSync('assets/icons/logo-256.jpg').toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <clipPath id="circleClip">
      <circle cx="256" cy="256" r="252" />
    </clipPath>
  </defs>
  <image href="data:image/jpeg;base64,${imgBase64}" x="0" y="0" width="512" height="512" clip-path="url(#circleClip)" preserveAspectRatio="xMidYMid slice" />
</svg>`;
fs.writeFileSync('assets/icons/logo.svg', svg);
console.log('Saved assets/icons/logo.svg, length:', svg.length);
