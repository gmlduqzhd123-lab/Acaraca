const fs = require('fs');
const path = require('path');

const scores = JSON.parse(fs.readFileSync('data/scores.json', 'utf8')).scores;

const categoryFolderMap = {
  '남성팀': '01. 아카라카_남성팀',
  '혼성팀': '02. 아카라카_혼성팀',
  '총보': '03. 아카라카_총보',
  '가요': '04. 가요',
  '동요': '05. 동요',
  'POP': '06. POP',
  'OST': '07. OST',
  '캐롤': '08. 캐롤',
  '클래식': '09. 클래식',
  '창작': '10. 창작',
  '페스티벌': '11. 페스티벌',
  '스쿨오브아카': '12. 스쿨오브아카',
  '기타': '13. 기타'
};

const targetRoot = path.join('C:', 'Users', 'user', 'Desktop', '아카라카_악보창고_1068곡_드라이브정리');
if (!fs.existsSync(targetRoot)) {
  fs.mkdirSync(targetRoot, { recursive: true });
}

Object.values(categoryFolderMap).forEach(f => {
  const p = path.join(targetRoot, f);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
});

const usedPaths = new Set();
let copiedCount = 0;
const catalogRows = ['번호\t곡명\t카테고리\t저장폴더\t파일명'];

scores.forEach((s, idx) => {
  const cat = s.category || '기타';
  const folderName = categoryFolderMap[cat] || '13. 기타';
  const folderPath = path.join(targetRoot, folderName);
  
  let baseName = path.basename(s.fileUrl);
  let destPath = path.join(folderPath, baseName);
  
  let counter = 2;
  while (usedPaths.has(destPath)) {
    const ext = path.extname(baseName);
    const nameWithoutExt = path.basename(baseName, ext);
    destPath = path.join(folderPath, `${nameWithoutExt} (${counter})${ext}`);
    counter++;
  }
  
  usedPaths.add(destPath);
  fs.copyFileSync(s.fileUrl, destPath);
  copiedCount++;

  catalogRows.push(`${copiedCount}\t${s.title}\t${cat}\t${folderName}\t${path.basename(destPath)}`);
});

// Write README and Catalog
const readmeContent = `# 아카라카 & 한국아카펠라교육연구회 통합 악보 창고 (총 ${copiedCount}곡)
구글 드라이브 업로드용 폴더화 정리본

## 📂 폴더 구조 및 수록 현황
1. 01. 아카라카_남성팀 (20곡) - 아카라카 남성팀 전용 NWC/악보
2. 02. 아카라카_혼성팀 (11곡) - 아카라카 혼성팀 전용 NWC/악보
3. 03. 아카라카_총보 (4곡) - 공통 총보 및 메들리
4. 04. 가요 (516곡) - 대중가요 아카펠라 편곡 악보
5. 05. 동요 (123곡) - 동요 및 어린이 아카펠라 악보
6. 06. POP (71곡) - 팝송 및 올드팝 아카펠라 악보
7. 07. OST (54곡) - 영화, 애니메이션, 뮤지컬 OST
8. 08. 캐롤 (68곡) - 크리스마스 캐롤 메들리 및 단곡
9. 09. 클래식 (58곡) - 클래식 명곡 아카펠라 편곡
10. 10. 창작 (48곡) - 연구회 및 단원 창작곡
11. 11. 페스티벌 (46곡) - 역대 페스티벌 수록곡
12. 12. 스쿨오브아카 (10곡) - 교육용 교재 수록곡
13. 13. 기타 (39곡) - 종교곡, 행사곡, 특수 편성

총 수록 곡수: ${copiedCount}곡

## 💡 구글 드라이브 업로드 방법
1. 아카라카 웹앱 상단 [📁 드라이브 폴더 열기 ↗] 버튼 클릭
2. 열린 구글 드라이브 웹 화면(브라우저)으로 본 '아카라카_악보창고_1068곡_드라이브정리' 폴더 내부의 번호별 폴더들을 드래그 앤 드롭
3. 업로드가 완료되면 구글 드라이브에서도 웹앱과 100% 동일한 깔끔한 카테고리로 악보를 확인 및 다운로드할 수 있습니다.
`;

fs.writeFileSync(path.join(targetRoot, '00_악보창고_안내.txt'), readmeContent, 'utf8');
fs.writeFileSync(path.join(targetRoot, '00_악보창고_전체목록.tsv'), catalogRows.join('\n'), 'utf8');

console.log(`Successfully exported all ${copiedCount} scores to ${targetRoot}`);
