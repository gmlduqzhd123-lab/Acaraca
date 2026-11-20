/**
 * AcaRaca 자료실 화면 (악보 창고·교육 자료·연습 영상·아카펠라 감상·우리들의 기록)
 * - 해당 탭을 처음 열 때 app.js가 불러온다.
 */
import { PARTS } from './data.js';
import { localDateString, getScoreFormatKey, getScoreFormatLabel } from './practiceLogic.js';
import { parseYouTube, createPlayer } from './player.js';
import { read, write } from './storage.js';
import { el, icon, button, toast, emptyState } from './ui.js';
import { loadScores, loadMemories, loadEducation, loadPracticeVideos, addCustomPracticeVideo, deleteCustomPracticeVideo, loadAppreciation, addCustomAppreciation, deleteCustomAppreciation, prefetchOfflineUrls, deleteCustomScore, addCustomMemory, deleteCustomMemory, addCustomEducation, deleteCustomEducation } from './archive.js';
import { saveMediaFile, getMediaBlobUrl } from './mediaStorage.js';

// app.js에 있는 화면 상태·이동 도우미는 처음 불러올 때 bindApp으로 넘겨받는다.
let app, state, activePlayers, navigate, openSong, isProtectedAuthorized, openProtectedAuthDialog, renderProtectedLockScreen, openUploadScoreModal, openOrDownloadScore, openPitchPipe, render;
export function bindApp(ctx) {
  ({ app, state, activePlayers, navigate, openSong, isProtectedAuthorized, openProtectedAuthDialog, renderProtectedLockScreen, openUploadScoreModal, openOrDownloadScore, openPitchPipe, render } = ctx);
}

export function renderScores() {
  if (!isProtectedAuthorized('scores')) {
    renderProtectedLockScreen('scores');
    openProtectedAuthDialog('scores', () => renderScores());
    return;
  }
  const songOptions = [{ value: '', label: '전체 곡 악보 보기' }];
  for (const s of state.songs) {
    const baseId = String(s.id).replace(/-[0-9]+$/, '');
    if (state.scores.some(sc => sc.songId === s.id || (baseId !== s.id && sc.songId === baseId))) {
      songOptions.push({ value: s.id, label: s.title });
    }
  }

  const categoryOptions = ['전체', '남성팀', '혼성팀', '연구회', '가요', '동요', 'POP', 'OST', '캐롤', '클래식', '창작', '페스티벌', '총보', '파트보'];
  const yearOptions = ['전체 연도', '2025년', '2024년', '2023년', '2022년', '2021년', '2020년 이전'];
  const formatOptions = [
    { value: '', label: '전체 포맷' },
    { value: 'nwc', label: '🎵 NWC' },
    { value: 'pdf', label: '📄 PDF' },
    { value: 'midi', label: '🎹 MIDI' },
    { value: 'etc', label: '🎼 기타' }
  ];

  const offlineScoresBtn = button('📥 현재 목록 오프라인 보관', async (e) => {
    const btn = e.currentTarget;
    const filtered = getFilteredScores();
    const urls = filtered.slice(0, 60).map(sc => sc.fileUrl).filter(Boolean);
    if (!urls.length) {
      toast('오프라인 보관할 로컬 악보가 없습니다.');
      return;
    }
    const orig = btn.textContent;
    btn.disabled = true;
    try {
      const res = await prefetchOfflineUrls(urls, ({ done, total }) => {
        btn.textContent = `⏳ 보관 중 (${done}/${total})`;
      });
      toast(`📥 악보 ${res.succeeded}개를 기기 오프라인 캐시에 저장했습니다!`);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }, 'button secondary small', 'download', { title: '현재 필터된 악보(최대 60개)를 지하 연습실·공연장 오프라인 열람용으로 미리 저장합니다' });

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'OUR SCORE ARCHIVE'}),
        el('h1', {text: '악보 창고'}),
        el('p', {text: `아카라카 및 연구회 통합 악보 아카이브 (총 ${state.scores.length.toLocaleString()}개 악보)`})
      ),
      el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap;'},
        offlineScoresBtn,
        button('📁 드라이브 폴더 열기 ↗', () => window.open('https://drive.google.com/drive/folders/1kHXtiDydo0XYbAP9MMgtrWLXQMi9Nzcb', '_blank', 'noopener,noreferrer'), 'button secondary small', 'external'),
        button('+ 새 악보 올리기', () => openUploadScoreModal(), 'button primary small', 'plus')
      )
    )
  );

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '악보 제목, 곡명, 편곡자, 팀, 연도 검색...',
    value: state.scoreFilters.query || '',
    oninput: (e) => {
      state.scoreFilters.query = e.target.value;
      updateScoreList(true);
    }
  });

  const categoryChips = el('div', {class: 'chip-group'},
    categoryOptions.map(cat => button(cat, () => {
      state.scoreFilters.category = cat === '전체' ? '' : cat;
      for (const btn of categoryChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === cat);
      }
      updateScoreList(true);
    }, `chip${(state.scoreFilters.category === cat || (!state.scoreFilters.category && cat === '전체')) ? ' active' : ''}`))
  );

  const yearChips = el('div', {class: 'chip-group'},
    yearOptions.map(yr => {
      const yearVal = yr === '전체 연도' ? '' : yr === '2020년 이전' ? '2020이전' : yr.replace('년', '');
      return button(yr, () => {
        state.scoreFilters.year = yearVal;
        for (const btn of yearChips.querySelectorAll('button')) {
          btn.classList.toggle('active', btn.textContent.trim() === yr);
        }
        updateScoreList(true);
      }, `chip${(state.scoreFilters.year === yearVal || (!state.scoreFilters.year && yr === '전체 연도')) ? ' active' : ''}`);
    })
  );

  const formatChips = el('div', {class: 'chip-group'},
    formatOptions.map(opt => button(opt.label, () => {
      state.scoreFilters.format = opt.value;
      for (const btn of formatChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === opt.label);
      }
      updateScoreList(true);
    }, `chip${(state.scoreFilters.format || '') === opt.value ? ' active' : ''}`))
  );

  const songSelect = el('select', {
    class: 'filter-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12px;',
    onchange: (e) => {
      state.scoreFilters.songId = e.target.value;
      updateScoreList(true);
    }
  }, songOptions.map(opt => el('option', {
    value: opt.value,
    text: opt.label,
    selected: state.scoreFilters.songId === opt.value
  })));

  const filterPanel = el('section', {class: 'filter-panel', style: 'margin-bottom: 24px;'},
    el('div', {class: 'search-input-wrap'}, icon('search'), searchInput),
    el('div', {style: 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;'},
      categoryChips,
      songSelect
    ),
    el('div', {style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;'},
      el('span', {style: 'font-size: 12px; font-weight: 600; color: var(--muted);', text: '연도별:'}),
      yearChips
    ),
    el('div', {style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;'},
      el('span', {style: 'font-size: 12px; font-weight: 600; color: var(--muted);', text: '파일 포맷:'}),
      formatChips
    )
  );

  const gridContainer = el('div', {class: 'score-grid'});
  const paginationContainer = el('div', {style: 'text-align: center; margin: 24px 0 40px;'});

  function getFilteredScores() {
    const q = (state.scoreFilters.query || '').trim().toLowerCase();
    const cat = state.scoreFilters.category || '';
    const sId = state.scoreFilters.songId || '';
    const sBaseId = sId ? String(sId).replace(/-[0-9]+$/, '') : '';
    const yr = state.scoreFilters.year || '';
    const fmt = state.scoreFilters.format || '';

    return state.scores.filter(sc => {
      const scFmt = getScoreFormatKey(sc);
      if (fmt === 'etc') {
        if (scFmt !== 'etc' && scFmt !== 'mscz') return false;
      } else if (fmt && scFmt !== fmt) {
        return false;
      }
      if (cat === '남성팀') {
        if (sc.team !== '남성팀' && sc.category !== '남성팀' && !sc.title?.includes('남성')) return false;
      } else if (cat === '혼성팀') {
        if (sc.team !== '혼성팀' && sc.category !== '혼성팀' && !sc.title?.includes('혼성')) return false;
      } else if (cat === '연구회') {
        if (sc.team !== '연구회' && sc.source !== '한국아카펠라교육연구회' && !sc.fileUrl?.includes('research')) return false;
      } else if (cat) {
        const matchesCategory = sc.category === cat || (sc.category && sc.category.toLowerCase().includes(cat.toLowerCase())) || (sc.title && sc.title.includes(cat));
        if (!matchesCategory) return false;
      }
      if (sId && sc.songId !== sId && !(sBaseId !== sId && sc.songId === sBaseId)) return false;
      if (yr === '2020이전') {
        if (!sc.year || Number(sc.year) > 2020) return false;
      } else if (yr && sc.year && sc.year !== yr) {
        return false;
      }
      if (q) {
        const song = state.songs.find(s => s.id === sc.songId);
        const matchTitle = (sc.title || '').toLowerCase().includes(q);
        const matchSong = (song?.title || '').toLowerCase().includes(q);
        const matchArranger = (sc.arranger || '').toLowerCase().includes(q);
        const matchMemo = (sc.memo || '').toLowerCase().includes(q);
        const matchYear = (sc.year || '').toLowerCase().includes(q);
        const matchTeam = (sc.team || '').toLowerCase().includes(q);
        const matchCategory = (sc.category || '').toLowerCase().includes(q);
        const matchSource = (sc.source || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSong && !matchArranger && !matchMemo && !matchYear && !matchTeam && !matchCategory && !matchSource) return false;
      }
      return true;
    });
  }

  let displayLimit = 36;

  function updateScoreList(resetLimit = false) {
    if (resetLimit) {
      displayLimit = 36;
    }
    const filtered = getFilteredScores();
    paginationContainer.replaceChildren();

    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('조건에 맞는 악보가 없습니다', '검색어나 필터를 바꾸거나 새 악보를 직접 등록해 보세요.', button('+ 악보 등록하기', () => openUploadScoreModal(), 'button primary small'))
      );
      return;
    }

    const visibleScores = filtered.slice(0, displayLimit);
    gridContainer.replaceChildren(...visibleScores.map(sc => {
      const song = state.songs.find(s => s.id === sc.songId);

      const badges = el('div', {class: 'score-badges'},
        sc.team && el('span', {
          class: 'badge',
          style: sc.team === '남성팀'
            ? 'background: rgba(37, 99, 235, 0.12); color: #1d4ed8; font-weight: 700;'
            : sc.team === '혼성팀'
            ? 'background: rgba(219, 39, 119, 0.12); color: #be185d; font-weight: 700;'
            : sc.team === '연구회'
            ? 'background: rgba(16, 185, 129, 0.14); color: #047857; font-weight: 700;'
            : 'background: var(--brand-tint, rgba(25,77,70,0.08)); color: var(--brand); font-weight: 600;',
          text: sc.team === '연구회' ? '한아교연' : sc.team
        }),
        sc.year && el('span', {class: 'badge', style: 'background: var(--brand-tint, rgba(25,77,70,0.08)); color: var(--brand); font-weight: 600;', text: `${sc.year}년`}),
        sc.category && el('span', {class: 'badge', text: sc.category}),
        sc.part && sc.part !== 'all' && el('span', {class: 'badge status-badge', text: PARTS[sc.part] || sc.part}),
        song && el('span', {class: 'part-pill', text: song.title})
      );

      const iconBadge = el('div', {class: 'score-icon-badge'}, icon('document'));

      const top = el('div', {class: 'score-top'},
        iconBadge,
        el('div', {class: 'score-info'},
          badges,
          el('h2', {class: 'score-title', text: sc.title}),
          el('p', {class: 'score-arranger', text: `${sc.arranger || (sc.source || '아카라카')} ${sc.uploadedAt ? `· ${sc.uploadedAt}` : sc.year ? `· ${sc.year}년` : ''}`})
        )
      );

      const memo = sc.memo ? el('p', {class: 'score-memo', text: sc.memo}) : null;

      const formatLabel = getScoreFormatLabel(sc);

      const metaRow = el('div', {class: 'score-meta-row'},
        el('span', {text: `${sc.pages || ''} ${sc.fileSize ? `· ${sc.fileSize}` : ''}`.trim() || '악보 자료'}),
        el('span', {class: 'badge', style: 'font-size: 10px;', text: formatLabel})
      );

      const actions = el('div', {class: 'score-actions'},
        button('악보 열기', () => openOrDownloadScore(sc, false), 'button primary small', 'external'),
        button('다운로드', () => openOrDownloadScore(sc, true), 'button secondary small', 'download'),
        sc.driveUrl ? button('드라이브 ↗', () => window.open(sc.driveUrl, '_blank', 'noopener,noreferrer'), 'button ghost small') : null,
        song ? button('연습실 ↗', () => openSong(song), 'button ghost small') : null,
        sc.isCustom ? button('삭제', async () => {
          if (confirm(`'${sc.title}' 악보를 삭제할까요?`)) {
            await deleteCustomScore(sc.id);
            state.scores = await loadScores(true);
            render();
            toast('악보를 삭제했습니다.');
          }
        }, 'button secondary small danger', 'trash') : null
      );

      return el('article', {class: 'score-card'}, top, memo, metaRow, actions);
    }));

    if (filtered.length > displayLimit) {
      const remaining = filtered.length - displayLimit;
      const loadMoreBtn = button(`악보 더 보기 (+36개 더보기 · 남은 악보: ${remaining.toLocaleString()}개)`, () => {
        displayLimit += 36;
        updateScoreList(false);
      }, 'button secondary', 'chevron-down');
      loadMoreBtn.style.cssText = 'padding: 12px 28px; font-weight: 700; border-radius: 999px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); cursor: pointer;';
      paginationContainer.replaceChildren(loadMoreBtn);
    }
  }

  updateScoreList(true);
  app.append(heading, filterPanel, gridContainer, paginationContainer);
}


/* -------------------------------------------------------------
 *  ACAPELLA EDUCATION (아카펠라 교육 자료)
 * ------------------------------------------------------------- */

function openUploadEducationModal() {
  const dialog = document.getElementById('upload-education-dialog');
  if (!dialog) return;

  const form = document.getElementById('upload-education-form');
  const titleInput = document.getElementById('edu-title-input');
  const categorySelect = document.getElementById('edu-category-select');
  const targetSelect = document.getElementById('edu-target-select');
  const authorInput = document.getElementById('edu-author-input');
  const descInput = document.getElementById('edu-desc-input');
  const fileInput = document.getElementById('edu-file-input');
  const urlInput = document.getElementById('edu-url-input');
  const cancelBtn = document.getElementById('upload-edu-cancel');
  const submitBtn = document.getElementById('upload-edu-submit');

  titleInput.value = '';
  categorySelect.value = '교재 / PDF';
  targetSelect.value = '초등 학생용';
  authorInput.value = read('last_feedback_author', '아카라카 교육연구회');
  descInput.value = '';
  fileInput.value = '';
  urlInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '교육 자료 등록하기';

  const closeBtn = document.getElementById('upload-education-close');
  cancelBtn.onclick = () => dialog.close();
  if (closeBtn) closeBtn.onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('자료 제목을 입력해 주세요.');
      return;
    }

    const file = fileInput.files?.[0];
    const url = urlInput.value.trim();

    if (!file && !url) {
      toast('내 컴퓨터에서 파일을 선택하거나 온라인 링크를 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const eduId = `edu-custom-${Date.now()}`;
      let mediaId = null;
      let fileUrl = url || '';
      let format = 'other';
      let fileName = '';
      let fileSize = '';

      if (file) {
        mediaId = `media-edu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        fileName = file.name;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        fileSize = sizeMb >= 1 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;

        const record = await saveMediaFile(mediaId, file, { title });
        if (!record) throw new Error('파일 저장에 실패했습니다.');

        if (record.isPpt || /\.(ppt|pptx)$/i.test(fileName)) format = 'ppt';
        else if (record.isPdf || /\.pdf$/i.test(fileName)) format = 'pdf';
        else if (record.isVideo) format = 'video';
        else if (record.isAudio) format = 'audio';
        else format = 'file';
      } else if (url) {
        if (url.includes('youtube.com') || url.includes('youtu.be')) format = 'video';
        else if (/\.pdf($|\?)/i.test(url)) format = 'pdf';
        else if (/\.(ppt|pptx)($|\?)/i.test(url)) format = 'ppt';
        else format = 'link';
      }

      const category = categorySelect.value;
      const target = targetSelect.value;
      const author = authorInput.value.trim() || '아카라카';
      const description = descInput.value.trim();

      const newEdu = {
        id: eduId,
        title,
        category,
        format,
        target,
        author,
        date: localDateString(),
        description,
        fileName,
        fileSize,
        fileUrl,
        mediaId,
        isCustom: true
      };

      addCustomEducation(newEdu);
      state.education = await loadEducation(true);
      dialog.close();
      render();
      toast('🎓 교육 자료가 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('자료 등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '교육 자료 등록하기';
    }
  };

  dialog.showModal();
}

function openEducationPdfModal(edu) {
  const fileUrl = edu.blobUrl || edu.fileUrl;
  if (!fileUrl) return;
  // 직접 입력한 주소가 javascript: 같은 스크립트 주소면 열지 않는다 (http/https, 상대 경로, 기기에 저장한 blob·PDF data만 허용)
  if (/^[a-z][a-z0-9+.-]*:/i.test(fileUrl) && !/^(https?:|blob:|data:application\/pdf[;,])/i.test(fileUrl)) {
    toast('이 자료 주소는 열 수 없습니다. http(s) 주소인지 확인해 주세요.');
    return;
  }
  const safeUrl = (fileUrl.startsWith('blob:') || fileUrl.startsWith('data:') || fileUrl.includes('%'))
    ? fileUrl
    : encodeURI(fileUrl);

  document.getElementById('edu-pdf-dialog')?.remove();
  const dialog = el('dialog', {
    id: 'edu-pdf-dialog',
    class: 'stage-modal-dialog score-preview-dialog',
    'aria-labelledby': 'edu-pdf-modal-title',
    onclick: (e) => {
      if (e.target === dialog) dialog.close();
    }
  });

  const header = el('div', { class: 'stage-modal-header' },
    el('div', {},
      el('div', { style: 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px;' },
        el('span', { class: 'badge', style: 'background: var(--brand); color: #fff; font-weight: 700;', text: 'PDF 교재' }),
        edu.category && el('span', { class: 'badge', text: edu.category }),
        edu.target && el('span', { class: 'badge status-badge', text: edu.target })
      ),
      el('h3', { id: 'edu-pdf-modal-title', text: `📑 ${edu.title}` }),
      el('p', { style: 'font-size: 12.5px; color: var(--muted); margin-top: 2px;', text: `${edu.author || '아카라카'}${edu.pages ? ` · ${edu.pages}` : ''}${edu.fileSize ? ` · ${edu.fileSize}` : ''} · 인앱 교육 교재 뷰어` })
    ),
    button('✕', () => dialog.close(), 'icon-button', null, { 'aria-label': '닫기' })
  );

  const pdfFrame = el('iframe', {
    class: 'score-pdf-frame',
    src: `${safeUrl}#view=FitH`,
    title: `${edu.title} PDF 교재 미리보기`
  });

  const footer = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border);' },
    el('div', { style: 'display: flex; gap: 8px; flex-wrap: wrap;' },
      button('🔍 새 탭에서 크게 열기 ↗', () => window.open(safeUrl, '_blank', 'noopener,noreferrer'), 'button secondary small', 'external'),
      button('📥 PDF 다운로드', () => openOrDownloadEducation(edu, true), 'button secondary small', 'download'),
      button('🎛️ 피치파이프 열기', () => {
        dialog.close();
        openPitchPipe();
      }, 'button ghost small')
    ),
    button('닫기', () => dialog.close(), 'button primary small')
  );

  const body = el('div', { class: 'stage-modal-body score-preview-body' }, pdfFrame, footer);
  dialog.append(header, body);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function openOrDownloadEducation(edu, forceDownload = false) {
  const fileUrl = edu.blobUrl || edu.fileUrl || edu.videoUrl;
  if (!fileUrl) {
    toast('첨부된 파일이나 링크가 없습니다.');
    return;
  }

  if (edu.format === 'video' && !forceDownload) {
    if (fileUrl.includes('youtube') || fileUrl.includes('youtu.be')) {
      openMemoryLightboxModal({
        id: edu.id,
        title: edu.title,
        type: 'video',
        category: '강의 / 교육 영상',
        videoUrl: fileUrl,
        date: edu.date,
        venue: '교육 영상',
        author: edu.author,
        description: edu.description
      });
      return;
    }
  }

  const isPdf = edu.format === 'pdf' || /\.pdf$/i.test(edu.fileName || '') || /\.pdf(?:$|\?)/i.test(fileUrl);
  if (!forceDownload && isPdf) {
    openEducationPdfModal(edu);
    return;
  }

  if (forceDownload || edu.format === 'ppt' || edu.format === 'file') {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = edu.fileName || `${edu.title}.${edu.format === 'ppt' ? 'pptx' : edu.format === 'pdf' ? 'pdf' : 'dat'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast(`📥 '${edu.title}' 파일을 다운로드합니다.`);
  } else {
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  }
}

export function renderEducation() {
  if (!isProtectedAuthorized('education')) {
    renderProtectedLockScreen('education');
    openProtectedAuthDialog('education', () => renderEducation());
    return;
  }
  const categoryOptions = ['전체', '교재 / PDF', '발표 슬라이드 (PPT)', '강의 / 교육 영상', '발성 & 화음 지도안'];
  const targetOptions = ['전체 대상', '초등 학생용', '교사 연수용', '아카펠라 동아리', '공통'];

  const offlineEduBtn = button('📥 교재 PDF 오프라인 보관', async (e) => {
    const btn = e.currentTarget;
    const urls = state.education
      .filter(item => item.fileUrl && (item.format === 'pdf' || /\.pdf$/i.test(item.fileName || item.fileUrl || '')))
      .map(item => item.fileUrl);
    if (!urls.length) {
      toast('오프라인 보관할 PDF 교육 자료가 없습니다.');
      return;
    }
    const orig = btn.textContent;
    btn.disabled = true;
    try {
      const res = await prefetchOfflineUrls(urls, ({ done, total }) => {
        btn.textContent = `⏳ 보관 중 (${done}/${total})`;
      });
      toast(`📥 교육 교재 PDF ${res.succeeded}개를 기기 오프라인 캐시에 저장했습니다!`);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }, 'button secondary small', 'download', { title: '교육 교재 PDF를 연습실·강의장 오프라인 열람용으로 미리 저장합니다' });

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'ACAPELLA EDUCATION & WORKSHOPS'}),
        el('h1', {text: '아카펠라 교육 자료'}),
        el('p', {text: '선생님과 학생이 함께하는 아카펠라 지도법, 워크숍 슬라이드(PPT), 교재 PDF, 수업 강의 영상 자료실입니다.'})
      ),
      el('div', {style: 'display: flex; gap: 8px; flex-wrap: wrap;'},
        offlineEduBtn,
        button('+ 새 교육 자료 올리기', () => openUploadEducationModal(), 'button primary small', 'plus')
      )
    )
  );

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '자료 제목, 강사, 주제, 교육 대상 검색...',
    value: state.educationFilters.query || '',
    oninput: (e) => {
      state.educationFilters.query = e.target.value;
      updateEduList();
    }
  });

  const categoryChips = el('div', {class: 'chip-group'},
    categoryOptions.map(cat => button(cat, () => {
      state.educationFilters.category = cat === '전체' ? '' : cat;
      for (const btn of categoryChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === cat);
      }
      updateEduList();
    }, `chip${(state.educationFilters.category === cat || (!state.educationFilters.category && cat === '전체')) ? ' active' : ''}`))
  );

  const targetSelect = el('select', {
    class: 'search-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12.5px;',
    onchange: (e) => {
      state.educationFilters.target = e.target.value === '전체 대상' ? '' : e.target.value;
      updateEduList();
    }
  }, targetOptions.map(t => el('option', {value: t, selected: (!state.educationFilters.target && t === '전체 대상') || state.educationFilters.target === t}, t)));

  const filterRow = el('div', {style: 'display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 24px;'},
    categoryChips,
    el('div', {style: 'display: flex; align-items: center; gap: 8px;'},
      el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'}, '대상별:'),
      targetSelect
    )
  );

  const filterPanel = el('div', {class: 'search-box'},
    el('div', {class: 'search-input-wrap'}, icon('search'), searchInput),
    filterRow
  );

  const gridContainer = el('div', {class: 'edu-grid'});

  function getFilteredEducation() {
    const q = (state.educationFilters.query || '').trim().toLowerCase();
    const cat = state.educationFilters.category || '';
    const tgt = state.educationFilters.target || '';

    return state.education.filter(item => {
      if (cat && item.category !== cat) return false;
      if (tgt && item.target && !item.target.includes(tgt) && !tgt.includes(item.target)) return false;
      if (q) {
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchAuthor = item.author?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchTarget = item.target?.toLowerCase().includes(q);
        const matchTags = item.tags?.some(t => t.toLowerCase().includes(q));
        if (!matchTitle && !matchAuthor && !matchDesc && !matchTarget && !matchTags) return false;
      }
      return true;
    });
  }

  function updateEduList() {
    const filtered = getFilteredEducation();
    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('조건에 맞는 교육 자료가 없습니다', '검색어를 바꾸거나 새 아카펠라 교육 자료를 등록해 보세요.', button('+ 자료 등록하기', () => openUploadEducationModal(), 'button primary small', 'plus'))
      );
      return;
    }

    gridContainer.replaceChildren(...filtered.map(item => {
      const fmt = item.format || (item.fileName?.endsWith('.pptx') || item.fileName?.endsWith('.ppt') ? 'ppt' : item.fileName?.endsWith('.pdf') ? 'pdf' : item.videoUrl ? 'video' : 'other');

      let iconType = 'document';
      let iconClass = 'other';
      let formatLabel = '자료';

      if (fmt === 'ppt') {
        iconType = 'presentation';
        iconClass = 'ppt';
        formatLabel = '📊 PPT 슬라이드';
      } else if (fmt === 'pdf') {
        iconType = 'document';
        iconClass = 'pdf';
        formatLabel = '📑 PDF 교재';
      } else if (fmt === 'video') {
        iconType = 'play';
        iconClass = 'video';
        formatLabel = '🎬 교육 영상';
      } else if (fmt === 'audio') {
        iconType = 'audio';
        iconClass = 'audio';
        formatLabel = '🎵 실습 음원';
      } else {
        iconType = 'academic';
        iconClass = 'other';
        formatLabel = '📂 교육 자료';
      }

      const iconBadge = el('div', {class: `edu-icon-badge ${iconClass}`}, icon(iconType));

      const badges = el('div', {class: 'edu-badges'},
        el('span', {class: 'badge', text: formatLabel}),
        item.target && el('span', {class: 'badge status-badge', text: item.target}),
        item.category && item.category !== formatLabel && el('span', {class: 'part-pill', text: item.category})
      );

      let thumbWrap = null;
      if (fmt === 'video' && item.thumbnail) {
        thumbWrap = el('div', {
          class: 'custom-video-thumb-wrap',
          style: 'border-radius: 12px; margin-bottom: 14px; overflow: hidden; cursor: pointer;',
          onclick: () => openOrDownloadEducation(item, false)
        },
          el('img', {
            src: item.thumbnail,
            alt: item.title,
            class: 'custom-video-thumb',
            loading: 'lazy'
          }),
          item.duration ? el('div', { class: 'custom-video-badge' }, item.duration) : null,
          el('div', { class: 'custom-video-source-pill' }, '🔗 YouTube'),
          el('div', { class: 'custom-video-play-overlay' },
            el('div', { class: 'custom-video-play-btn' }, icon('play'))
          )
        );
      }

      const top = el('div', {class: 'edu-top'},
        iconBadge,
        el('div', {class: 'edu-info'},
          badges,
          el('h2', {class: 'edu-title', text: item.title}),
          el('p', {class: 'edu-author', text: `${item.author || '아카라카'} ${item.date ? `· ${item.date}` : ''}`})
        )
      );

      const desc = item.description ? el('p', {class: 'edu-desc', text: item.description}) : null;

      const metaRow = el('div', {class: 'edu-meta-row'},
        el('span', {text: `${item.duration ? `⏱ ${item.duration} · ` : ''}${item.slides || item.pages || ''} ${item.fileSize ? `· ${item.fileSize}` : ''}`.trim() || '아카펠라 교육 자료'}),
        el('span', {class: 'badge', style: 'font-size: 10.5px;', text: (item.format === 'video' ? 'VIDEO' : item.format?.toUpperCase()) || '자료'})
      );

      const actions = el('div', {class: 'edu-actions'},
        fmt === 'video'
          ? button('🎬 영상 보기', () => openOrDownloadEducation(item, false), 'button primary small', 'play')
          : fmt === 'ppt'
          ? button('📥 PPT 다운로드', () => openOrDownloadEducation(item, true), 'button primary small', 'download')
          : button('📖 자료 열기', () => openOrDownloadEducation(item, false), 'button primary small', 'external'),
        (item.blobUrl || item.fileUrl) && fmt !== 'ppt'
          ? button('다운로드', () => openOrDownloadEducation(item, true), 'button secondary small', 'download')
          : null,
        item.isCustom ? button('삭제', async () => {
          if (confirm(`'${item.title}' 교육 자료를 삭제할까요?`)) {
            await deleteCustomEducation(item.id);
            state.education = await loadEducation(true);
            render();
            toast('교육 자료를 삭제했습니다.');
          }
        }, 'button secondary small danger', 'trash') : null
      );

      return el('article', {class: 'edu-card'}, thumbWrap, top, desc, metaRow, actions);
    }));

  }

  updateEduList();
  app.append(heading, filterPanel, gridContainer);
}


/* -------------------------------------------------------------
 *  PRACTICE VIDEOS (연습 영상)
 * ------------------------------------------------------------- */

function openUploadPracticeVideoModal() {
  const dialog = document.getElementById('upload-practice-video-dialog');
  if (!dialog) return;

  const form = document.getElementById('upload-practice-vid-form');
  const titleInput = document.getElementById('practice-vid-title-input');
  const songSelect = document.getElementById('practice-vid-song-select');
  const partSelect = document.getElementById('practice-vid-part-select');
  const dateInput = document.getElementById('practice-vid-date-input');
  const authorInput = document.getElementById('practice-vid-author-input');
  const descInput = document.getElementById('practice-vid-desc-input');
  const ytGroup = document.getElementById('practice-yt-group');
  const fileGroup = document.getElementById('practice-file-group');
  const ytBtn = document.getElementById('practice-source-yt-btn');
  const fileBtn = document.getElementById('practice-source-file-btn');
  const urlInput = document.getElementById('practice-vid-url-input');
  const fileInput = document.getElementById('practice-vid-file-input');
  const cancelBtn = document.getElementById('upload-practice-vid-cancel');
  const submitBtn = document.getElementById('upload-practice-vid-submit');
  const closeBtn = document.getElementById('upload-practice-vid-close');

  let currentSource = 'youtube';

  titleInput.value = '';
  dateInput.value = localDateString();
  authorInput.value = read('last_practice_author', '아카라카 단원');
  descInput.value = '';
  urlInput.value = '';
  fileInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '연습 영상 등록하기';

  songSelect.replaceChildren(
    el('option', { value: '' }, '일반 / 곡 미선택'),
    ...state.songs.map(s => el('option', { value: s.id }, s.title))
  );

  function setSource(source) {
    currentSource = source;
    if (source === 'youtube') {
      ytBtn.classList.add('active');
      fileBtn.classList.remove('active');
      ytGroup.style.display = 'block';
      fileGroup.style.display = 'none';
      urlInput.required = true;
      fileInput.required = false;
    } else {
      ytBtn.classList.remove('active');
      fileBtn.classList.add('active');
      ytGroup.style.display = 'none';
      fileGroup.style.display = 'block';
      urlInput.required = false;
      fileInput.required = true;
    }
  }

  ytBtn.onclick = () => setSource('youtube');
  fileBtn.onclick = () => setSource('file');
  setSource('youtube');

  cancelBtn.onclick = () => dialog.close();
  if (closeBtn) closeBtn.onclick = () => dialog.close();
  dialog.onclick = (e) => { if (e.target === dialog) dialog.close(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('영상 제목을 입력해 주세요.');
      return;
    }

    const songId = songSelect.value || '';
    const part = partSelect.value;
    const date = dateInput.value || localDateString();
    const author = authorInput.value.trim() || '아카라카 단원';
    const description = descInput.value.trim();

    write('last_practice_author', author);

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const vidId = `practice-vid-${Date.now()}`;
      let videoUrl = '';
      let fileName = '';
      let fileSize = '';
      let mediaId = null;
      let blobUrl = null;
      let thumbnail = '';

      if (currentSource === 'youtube') {
        videoUrl = urlInput.value.trim();
        if (!videoUrl) {
          toast('YouTube 영상 주소를 입력해 주세요.');
          submitBtn.disabled = false;
          submitBtn.textContent = '연습 영상 등록하기';
          return;
        }
        const parsed = parseYouTube({ type: 'video', url: videoUrl });
        if (parsed.ok && parsed.videoId) {
          thumbnail = `https://img.youtube.com/vi/${parsed.videoId}/hqdefault.jpg`;
        }
      } else {
        const file = fileInput.files?.[0];
        if (!file) {
          toast('업로드할 영상 파일을 선택해 주세요.');
          submitBtn.disabled = false;
          submitBtn.textContent = '연습 영상 등록하기';
          return;
        }
        fileName = file.name;
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        fileSize = sizeMb >= 1 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;
        mediaId = `media-practice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const record = await saveMediaFile(mediaId, file, { title, songId, part });
        if (!record) throw new Error('영상 파일 브라우저 저장에 실패했습니다.');
        blobUrl = await getMediaBlobUrl(mediaId);
      }

      const newVideo = {
        id: vidId,
        title,
        songId,
        part,
        date,
        author,
        sourceType: currentSource,
        videoUrl,
        fileName,
        fileSize,
        mediaId,
        blobUrl,
        thumbnail,
        description,
        isCustom: true
      };

      addCustomPracticeVideo(newVideo);
      state.practiceVideos = await loadPracticeVideos(true);
      dialog.close();
      render();
      toast('🎬 연습 영상이 성공적으로 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('영상 등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '연습 영상 등록하기';
    }
  };

  dialog.showModal();
}

export function renderPracticeVideos() {
  const partOptions = ['전체 파트', '전체 합주', '소프라노', '메조', '알토', '테너', '바리톤', '베이스', '보컬퍼커션', '개인 연습'];
  const sourceOptions = ['전체 방식', '유튜브 링크', '파일 업로드'];

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'ACAPELLA PRACTICE CLIPS & ARCHIVE'}),
        el('h1', {text: '연습 영상'}),
        el('p', {text: '단원들의 파트별 연습 영상, 전체 합주 녹화본, 유튜브 링크 및 로컬 영상 보관소입니다.'})
      ),
      button('+ 새 연습 영상 올리기', () => openUploadPracticeVideoModal(), 'button primary small', 'plus')
    )
  );

  const searchInput = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: '영상 제목, 연관 곡명, 파트, 기록자 검색...',
    value: state.practiceVideoFilters.query || '',
    oninput: (e) => {
      state.practiceVideoFilters.query = e.target.value;
      updateVideoList();
    }
  });

  const partChips = el('div', {class: 'chip-group'},
    partOptions.map(p => button(p, () => {
      state.practiceVideoFilters.part = p === '전체 파트' ? '' : p;
      for (const btn of partChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === p);
      }
      updateVideoList();
    }, `chip${(state.practiceVideoFilters.part === p || (!state.practiceVideoFilters.part && p === '전체 파트')) ? ' active' : ''}`))
  );

  const songOptions = [
    { id: '', title: '전체 곡' },
    ...state.songs
  ];
  const songSelect = el('select', {
    class: 'search-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12.5px;',
    onchange: (e) => {
      state.practiceVideoFilters.songId = e.target.value;
      updateVideoList();
    }
  }, songOptions.map(s => el('option', { value: s.id, selected: state.practiceVideoFilters.songId === s.id }, s.title)));

  const sourceSelect = el('select', {
    class: 'search-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12.5px;',
    onchange: (e) => {
      state.practiceVideoFilters.sourceType = e.target.value === '전체 방식' ? '' : e.target.value;
      updateVideoList();
    }
  }, sourceOptions.map(s => el('option', { value: s, selected: (!state.practiceVideoFilters.sourceType && s === '전체 방식') || state.practiceVideoFilters.sourceType === s }, s)));

  const filterRow = el('div', {style: 'display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 24px;'},
    partChips,
    el('div', {style: 'display: flex; align-items: center; gap: 12px; flex-wrap: wrap;'},
      el('div', {style: 'display: flex; align-items: center; gap: 6px;'},
        el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'}, '곡:'),
        songSelect
      ),
      el('div', {style: 'display: flex; align-items: center; gap: 6px;'},
        el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'}, '구분:'),
        sourceSelect
      )
    )
  );

  const filterPanel = el('div', {class: 'search-box'},
    el('div', {class: 'search-input-wrap'}, icon('search'), searchInput),
    filterRow
  );

  const gridContainer = el('div', {class: 'video-card-grid'});

  function getFilteredVideos() {
    const q = (state.practiceVideoFilters.query || '').trim().toLowerCase();
    const part = state.practiceVideoFilters.part || '';
    const songId = state.practiceVideoFilters.songId || '';
    const srcType = state.practiceVideoFilters.sourceType || '';

    return state.practiceVideos.filter(vid => {
      if (part && vid.part !== part) return false;
      if (songId && vid.songId !== songId) return false;
      if (srcType === '유튜브 링크' && vid.sourceType !== 'youtube') return false;
      if (srcType === '파일 업로드' && vid.sourceType !== 'file') return false;
      if (q) {
        const songObj = state.songs.find(s => s.id === vid.songId);
        const matchTitle = vid.title?.toLowerCase().includes(q);
        const matchAuthor = vid.author?.toLowerCase().includes(q);
        const matchDesc = vid.description?.toLowerCase().includes(q);
        const matchPart = vid.part?.toLowerCase().includes(q);
        const matchSong = songObj?.title?.toLowerCase().includes(q);
        if (!matchTitle && !matchAuthor && !matchDesc && !matchPart && !matchSong) return false;
      }
      return true;
    });
  }

  function updateVideoList() {
    const filtered = getFilteredVideos();
    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('등록된 연습 영상이 없습니다', '단원들과 함께 촬영한 합주 영상 파일이나 YouTube 링크를 올려 보세요.', button('+ 연습 영상 올리기', () => openUploadPracticeVideoModal(), 'button primary small', 'plus'))
      );
      return;
    }

    gridContainer.replaceChildren(...filtered.map(vid => {
      const isFile = vid.sourceType === 'file';
      const isYt = !isFile;
      const songObj = state.songs.find(s => s.id === vid.songId);

      const thumbWrap = el('div', {
        class: 'custom-video-thumb-wrap',
        onclick: () => openMemoryLightboxModal({
          id: vid.id,
          title: vid.title,
          type: 'video',
          category: vid.part ? `연습 영상 · ${vid.part}` : '연습 영상',
          videoUrl: vid.videoUrl,
          mediaUrl: vid.blobUrl,
          blobUrl: vid.blobUrl,
          sourceType: vid.sourceType,
          date: vid.date,
          venue: songObj?.title ? `관련 곡: ${songObj.title}` : 'AcaRaca 연습실',
          author: vid.author,
          description: vid.description
        })
      });

      if (isYt && vid.thumbnail) {
        thumbWrap.append(el('img', {
          src: vid.thumbnail,
          alt: vid.title,
          class: 'custom-video-thumb',
          loading: 'lazy'
        }));
      } else {
        thumbWrap.append(
          el('div', {style: 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--muted);'},
            icon('video'),
            el('span', {style: 'font-size: 11px;'}, vid.fileName || '업로드된 연습 영상 파일')
          )
        );
      }

      thumbWrap.append(
        el('div', {class: 'custom-video-badge'}, vid.part || '합주 연습'),
        el('div', {class: 'custom-video-source-pill'}, isFile ? '📁 파일' : '🔗 YouTube'),
        el('div', {class: 'custom-video-play-overlay'},
          el('div', {class: 'custom-video-play-btn'}, icon('play'))
        )
      );

      const body = el('div', {class: 'custom-video-body'},
        songObj ? el('div', {style: 'margin-bottom: 6px;'},
          el('span', {class: 'memory-tag', style: 'cursor: pointer;', onclick: () => openSong(songObj)}, `🎶 ${songObj.title}`)
        ) : null,
        el('h3', {
          class: 'custom-video-title',
          text: vid.title,
          onclick: () => openMemoryLightboxModal({
            id: vid.id,
            title: vid.title,
            type: 'video',
            category: vid.part ? `연습 영상 · ${vid.part}` : '연습 영상',
            videoUrl: vid.videoUrl,
            mediaUrl: vid.blobUrl,
            blobUrl: vid.blobUrl,
            sourceType: vid.sourceType,
            date: vid.date,
            venue: songObj?.title ? `관련 곡: ${songObj.title}` : 'AcaRaca 연습실',
            author: vid.author,
            description: vid.description
          })
        }),
        vid.description ? el('p', {class: 'custom-video-desc', text: vid.description}) : null,
        el('div', {class: 'custom-video-footer'},
          el('span', {}, `📅 ${vid.date || ''} · 👤 ${vid.author || '단원'}`),
          vid.isCustom ? button('', async (e) => {
            e.stopPropagation();
            if (confirm(`'${vid.title}' 연습 영상을 삭제하시겠습니까?`)) {
              await deleteCustomPracticeVideo(vid.id);
              state.practiceVideos = await loadPracticeVideos(true);
              render();
              toast('연습 영상이 삭제되었습니다.');
            }
          }, 'icon-button', 'trash', {'aria-label': '영상 삭제', title: '영상 삭제'}) : null
        )
      );

      return el('article', {class: 'custom-video-card'}, thumbWrap, body);
    }));
  }

  updateVideoList();
  app.append(heading, filterPanel, gridContainer);
}


/* -------------------------------------------------------------
 *  ACAPELLA APPRECIATION (아카펠라 감상)
 * ------------------------------------------------------------- */

function openUploadAppreciationModal() {
  const dialog = document.getElementById('upload-appreciation-dialog');
  if (!dialog) return;

  const form = document.getElementById('upload-apprec-form');
  const urlInput = document.getElementById('apprec-url-input');
  const titleInput = document.getElementById('apprec-title-input');
  const artistInput = document.getElementById('apprec-artist-input');
  const categorySelect = document.getElementById('apprec-category-select');
  const uploaderInput = document.getElementById('apprec-uploader-input');
  const descInput = document.getElementById('apprec-desc-input');
  const cancelBtn = document.getElementById('upload-apprec-cancel');
  const submitBtn = document.getElementById('upload-apprec-submit');
  const closeBtn = document.getElementById('upload-apprec-close');

  urlInput.value = '';
  titleInput.value = '';
  artistInput.value = '';
  categorySelect.value = '국내 아카펠라';
  uploaderInput.value = read('last_apprec_uploader', '아카라카 단원');
  descInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '감상 영상 등록하기';

  cancelBtn.onclick = () => dialog.close();
  if (closeBtn) closeBtn.onclick = () => dialog.close();
  dialog.onclick = (e) => { if (e.target === dialog) dialog.close(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    const title = titleInput.value.trim();

    if (!url) {
      toast('유튜브 영상 링크를 입력해 주세요.');
      return;
    }
    if (!title) {
      toast('영상 제목을 입력해 주세요.');
      return;
    }

    const parsed = parseYouTube({ type: 'video', url });
    let thumbnail = '';
    if (parsed.ok && parsed.videoId) {
      thumbnail = `https://img.youtube.com/vi/${parsed.videoId}/hqdefault.jpg`;
    }

    const artist = artistInput.value.trim() || '아카펠라 아티스트';
    const category = categorySelect.value;
    const uploader = uploaderInput.value.trim() || '아카라카';
    const description = descInput.value.trim();

    write('last_apprec_uploader', uploader);

    const newApprec = {
      id: `apprec-${Date.now()}`,
      title,
      videoUrl: url,
      thumbnail,
      artist,
      category,
      uploader,
      date: localDateString(),
      description,
      isCustom: true
    };

    addCustomAppreciation(newApprec);
    state.appreciation = await loadAppreciation(true);
    dialog.close();
    render();
    toast('🎧 아카펠라 감상 영상이 등록되었습니다.');
  };

  dialog.showModal();
}

const APPREC_PAGE = 24;
export function renderAppreciation() {
  let apprecShown = APPREC_PAGE;
  const categoryOptions = ['전체', '연습곡', '국내 아카펠라', '해외 명작', '보컬 커버', '라이브 콘서트', '영화 / OST'];
  const artistOptions = [
    '전체 아티스트',
    '메이트리',
    '나린',
    '보이스밴드 엑시트',
    '다이아',
    '제니스',
    '오직목소리',
    '하모나이즈',
    '보이쳐',
    '아카시아',
    '솔리스츠',
    '스노우시티',
    '토리스',
    '스윗소로우',
    '펜타토닉스',
    '보이스플레이',
    '더 리얼 그룹',
    '비트펠라 하우스',
    '아카라카',
    '기타 그룹'
  ];
  const sortOptions = [
    { value: 'latest', label: '최신 영상순' },
    { value: 'title', label: '곡명순 (가나다)' },
    { value: 'artist', label: '아티스트순' }
  ];

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'ACAPELLA INSPIRATION & MASTERPIECES'}),
        el('h1', {text: '아카펠라 감상'}),
        el('p', {text: '아카라카 연습실 연습곡의 원곡 아카펠라 영상부터 메이트리, 엑시트, 펜타토닉스, 나린 등 국내외 프로 그룹들의 명작 아카이브입니다.'})
      ),
      button('+ 감상 영상 등록', () => openUploadAppreciationModal(), 'button primary small', 'plus')
    )
  );

  const searchInput = el('input', {
    type: 'search',
    id: 'apprec-search-input',
    class: 'search-input',
    placeholder: '영상 제목, 아티스트 / 그룹명, 태그(#오징어게임, #BTS 등) 검색...',
    value: state.appreciationFilters.query || '',
    oninput: (e) => {
      state.appreciationFilters.query = e.target.value;
      updateApprecList();
    }
  });

  const categoryChips = el('div', {class: 'chip-group'},
    categoryOptions.map(cat => button(cat, () => {
      state.appreciationFilters.category = cat === '전체' ? '' : cat;
      for (const btn of categoryChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === cat);
      }
      updateApprecList();
    }, `chip${(state.appreciationFilters.category === cat || (!state.appreciationFilters.category && cat === '전체')) ? ' active' : ''}`))
  );

  const sortSelect = el('select', {
    id: 'apprec-sort-select',
    class: 'search-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12.5px;',
    onchange: (e) => {
      state.appreciationFilters.sortBy = e.target.value;
      updateApprecList();
    }
  }, sortOptions.map(opt => el('option', { value: opt.value, selected: (state.appreciationFilters.sortBy || 'latest') === opt.value }, opt.label)));

  const artistSelect = el('select', {
    class: 'search-select',
    style: 'padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--ink); font-size: 12.5px;',
    onchange: (e) => {
      state.appreciationFilters.artist = e.target.value === '전체 아티스트' ? '' : e.target.value;
      updateApprecList();
    }
  }, artistOptions.map(a => el('option', { value: a, selected: (!state.appreciationFilters.artist && a === '전체 아티스트') || state.appreciationFilters.artist === a }, a)));

  const countSummary = el('div', {style: 'font-size: 12px; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;'});

  const filterRow = el('div', {style: 'display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 16px;'},
    categoryChips,
    el('div', {style: 'display: flex; align-items: center; gap: 12px; flex-wrap: wrap;'},
      el('div', {style: 'display: flex; align-items: center; gap: 6px;'},
        el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'}, '정렬:'),
        sortSelect
      ),
      el('div', {style: 'display: flex; align-items: center; gap: 6px;'},
        el('span', {style: 'font-size: 12px; color: var(--muted); font-weight: 600;'}, '그룹별:'),
        artistSelect
      )
    )
  );

  const filterPanel = el('div', {class: 'search-box'},
    el('div', {class: 'search-input-wrap'}, icon('search'), searchInput),
    filterRow
  );

  const gridContainer = el('div', {class: 'video-card-grid'});

  function getFilteredAppreciation() {
    const q = (state.appreciationFilters.query || '').trim().toLowerCase();
    const cat = state.appreciationFilters.category || '';
    const art = state.appreciationFilters.artist || '';
    const sortBy = state.appreciationFilters.sortBy || 'latest';

    const filtered = state.appreciation.filter(item => {
      if (cat && item.category !== cat) return false;
      if (art) {
        if (art === '기타 그룹') {
          const mainGroups = [
            '메이트리', '나린', '엑시트', '다이아', '제니스', '오직목소리',
            '두왑사운즈', '하모나이즈', '보이쳐', '아카시아', '솔리스츠',
            '스노우시티', '토리스', '스윗소로우', '펜타토닉스', '보이스플레이',
            '더 리얼 그룹', '비트펠라 하우스', '아카라카'
          ];
          if (mainGroups.some(g => item.artist?.includes(g))) return false;
        } else if (art === '보이스밴드 엑시트') {
          if (!item.artist?.includes('엑시트') && !item.artist?.includes('EXIT')) return false;
        } else if (art === '오직목소리') {
          if (!item.artist?.includes('오직목소리') && !item.artist?.includes('두왑사운즈')) return false;
        } else if (!item.artist?.includes(art)) {
          return false;
        }
      }
      if (q) {
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchArtist = item.artist?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchUploader = item.uploader?.toLowerCase().includes(q);
        const matchTags = item.tags?.some(t => t.toLowerCase().includes(q) || `#${t.toLowerCase()}`.includes(q));
        if (!matchTitle && !matchArtist && !matchDesc && !matchUploader && !matchTags) return false;
      }
      return true;
    });

    if (sortBy === 'title') {
      return [...filtered].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
    }
    if (sortBy === 'artist') {
      return [...filtered].sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'ko'));
    }
    // 'latest': default order (newest custom videos first, then newest curated Korean videos, then original library)
    return filtered;
  }

  function updateApprecList(keepPage = false) {
    if (!keepPage) apprecShown = APPREC_PAGE;
    const filtered = getFilteredAppreciation();
    const totalCount = state.appreciation.length;
    const isFiltered = Boolean(
      state.appreciationFilters.query ||
      state.appreciationFilters.category ||
      state.appreciationFilters.artist ||
      (state.appreciationFilters.sortBy && state.appreciationFilters.sortBy !== 'latest')
    );
    countSummary.replaceChildren(
      el('span', {}, el('strong', {style: 'color: var(--primary); font-size: 13px;'}, String(filtered.length)), `개의 아카펠라 영상 (전체 ${totalCount}개)`),
      isFiltered ? button('필터 초기화', () => {
        state.appreciationFilters = {query: '', category: '', artist: '', sortBy: 'latest'};
        searchInput.value = '';
        artistSelect.value = '전체 아티스트';
        sortSelect.value = 'latest';
        for (const btn of categoryChips.querySelectorAll('button')) {
          btn.classList.toggle('active', btn.textContent.trim() === '전체');
        }
        updateApprecList();
      }, 'text-button', 'close') : null
    );

    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('조건에 맞는 감상 영상이 없습니다', '검색어를 바꾸거나 필터를 초기화해 보세요.', button('전체 영상 보기', () => {
          state.appreciationFilters = {query: '', category: '', artist: '', sortBy: 'latest'};
          searchInput.value = '';
          artistSelect.value = '전체 아티스트';
          sortSelect.value = 'latest';
          for (const btn of categoryChips.querySelectorAll('button')) {
            btn.classList.toggle('active', btn.textContent.trim() === '전체');
          }
          updateApprecList();
        }, 'button primary small'))
      );
      return;
    }

    // 태블릿·휴대폰 부담을 줄이기 위해 한 번에 24개씩만 그리고 '더 보기'로 이어서 표시
    const shownItems = filtered.slice(0, apprecShown);
    gridContainer.replaceChildren(...shownItems.map(item => {
      const thumbWrap = el('div', {
        class: 'custom-video-thumb-wrap',
        onclick: () => openMemoryLightboxModal({
          id: item.id,
          songId: item.songId,
          title: item.title,
          type: 'video',
          category: `아카펠라 감상 · ${item.category || '명작'}`,
          videoUrl: item.videoUrl,
          date: item.date,
          venue: item.artist ? `아티스트: ${item.artist}` : 'YouTube',
          author: item.uploader ? `추천: ${item.uploader}` : '',
          description: item.description
        })
      });

      if (item.thumbnail) {
        const thumbImg = el('img', {
          src: item.thumbnail,
          alt: item.title,
          class: 'custom-video-thumb',
          loading: 'lazy',
          onerror: (e) => {
            const m = (item.videoUrl || '').match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
            if (m && !e.target.dataset.tried) {
              e.target.dataset.tried = '1';
              e.target.src = `https://img.youtube.com/vi/${m[1]}/0.jpg`;
            }
          }
        });
        thumbWrap.append(thumbImg);
      }

      thumbWrap.append(
        el('div', {class: 'custom-video-badge'}, item.category || '감상'),
        el('div', {class: 'custom-video-play-overlay'},
          el('div', {class: 'custom-video-play-btn'}, icon('play'))
        )
      );

      const body = el('div', {class: 'custom-video-body'},
        item.artist ? el('div', {style: 'margin-bottom: 6px;'},
          el('span', {
            class: 'memory-tag',
            style: 'cursor: pointer;',
            title: '이 아티스트 영상만 모아보기',
            onclick: (e) => {
              e.stopPropagation();
              const groupKeyword = item.artist.split(' ')[0];
              state.appreciationFilters.query = groupKeyword;
              searchInput.value = groupKeyword;
              updateApprecList();
            }
          }, `🎙️ ${item.artist}`)
        ) : null,
        el('h3', {
          class: 'custom-video-title',
          text: item.title,
          onclick: () => openMemoryLightboxModal({
            id: item.id,
            songId: item.songId,
            title: item.title,
            type: 'video',
            category: `아카펠라 감상 · ${item.category || '명작'}`,
            videoUrl: item.videoUrl,
            date: item.date,
            venue: item.artist ? `아티스트: ${item.artist}` : 'YouTube',
            author: item.uploader ? `추천: ${item.uploader}` : '',
            description: item.description
          })
        }),
        item.description ? el('p', {class: 'custom-video-desc', text: item.description}) : null,
        item.tags && item.tags.length ? el('div', {class: 'memory-tags-row', style: 'margin-bottom: 8px;'},
          item.tags.slice(0, 4).map(t => el('span', {
            class: 'memory-tag',
            style: 'font-size: 10.5px; cursor: pointer;',
            onclick: (e) => {
              e.stopPropagation();
              state.appreciationFilters.query = t;
              searchInput.value = t;
              updateApprecList();
            }
          }, `#${t}`))
        ) : null,
        el('div', {class: 'custom-video-footer'},
          el('span', {}, `추천: ${item.uploader || '단원'} · 📅 ${item.date || ''}`),
          el('div', {class: 'custom-video-actions'},
            item.songId ? button('연습실 ↗', (e) => {
              e.stopPropagation();
              navigate({song: item.songId});
            }, 'button secondary small', 'music', {title: '아카라카 연습실에서 이 곡 파트 연습하기'}) : null,
            item.videoUrl ? button('YouTube ↗', (e) => {
              e.stopPropagation();
              window.open(item.videoUrl, '_blank', 'noopener,noreferrer');
            }, 'button ghost small', 'external') : null,
            item.isCustom ? button('', async (e) => {
              e.stopPropagation();
              if (confirm(`'${item.title}' 감상 영상을 목록에서 삭제하시겠습니까?`)) {
                deleteCustomAppreciation(item.id);
                state.appreciation = await loadAppreciation(true);
                render();
                toast('감상 영상이 삭제되었습니다.');
              }
            }, 'icon-button', 'trash', {'aria-label': '영상 삭제', title: '영상 삭제'}) : null
          )
        )
      );

      return el('article', {class: 'custom-video-card'}, thumbWrap, body);
    }));
    if (filtered.length > shownItems.length) {
      gridContainer.append(el('div', {class: 'load-more-row'},
        button(`더 보기 (${shownItems.length} / ${filtered.length})`, () => { apprecShown += APPREC_PAGE; updateApprecList(true); }, 'button secondary', 'arrow')));
    }
  }

  updateApprecList();
  app.append(heading, filterPanel, countSummary, gridContainer);
}


/* -------------------------------------------------------------
 *  MEMORIES & MOMENTS (우리들의 기록)
 * ------------------------------------------------------------- */

function openUploadMemoryModal(defaultSongId = '') {
  const dialog = document.getElementById('upload-memory-dialog');
  if (!dialog) return;

  const form = document.getElementById('upload-memory-form');
  const titleInput = document.getElementById('mem-title-input');
  const categorySelect = document.getElementById('mem-category-select');
  const dateInput = document.getElementById('mem-date-input');
  const venueInput = document.getElementById('mem-venue-input');
  const authorInput = document.getElementById('mem-author-input');
  const descInput = document.getElementById('mem-desc-input');
  const tagsInput = document.getElementById('mem-tags-input');
  const fileInput = document.getElementById('mem-file-input');
  const urlInput = document.getElementById('mem-url-input');
  const cancelBtn = document.getElementById('upload-mem-cancel');
  const submitBtn = document.getElementById('upload-mem-submit');

  titleInput.value = '';
  categorySelect.value = '숏츠 영상';
  dateInput.value = localDateString();
  venueInput.value = '';
  authorInput.value = read('last_feedback_author', '아카라카');
  descInput.value = '';
  tagsInput.value = '';
  fileInput.value = '';
  urlInput.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = '기록 올리기';

  const closeBtn = document.getElementById('upload-memory-close');
  cancelBtn.onclick = () => dialog.close();
  if (closeBtn) closeBtn.onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      toast('기록 제목을 입력해 주세요.');
      return;
    }

    const file = fileInput.files?.[0];
    const url = urlInput.value.trim();

    if (!file && !url) {
      toast('사진/영상 파일을 선택하거나 YouTube 숏츠 주소를 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
      const memId = `mem-custom-${Date.now()}`;
      let mediaId = null;
      let mediaUrl = url || '';
      let thumbnail = '';
      let type = 'photo';

      if (file) {
        mediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = await saveMediaFile(mediaId, file, { title });
        if (!record) throw new Error('파일 저장에 실패했습니다.');
        type = file.type.startsWith('video') ? 'video' : 'photo';
      } else if (url) {
        type = url.includes('/shorts/') ? 'shorts' : (url.includes('youtube.com') || url.includes('youtu.be')) ? 'video' : 'photo';
        const ytInfo = parseYouTube({ type: 'video', url });
        if (ytInfo.ok && ytInfo.videoId) {
          thumbnail = `https://img.youtube.com/vi/${ytInfo.videoId}/hqdefault.jpg`;
        }
      }

      const tags = tagsInput.value
        .split(',')
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const newMemory = {
        id: memId,
        title,
        category: categorySelect.value || '기록',
        type,
        date: dateInput.value || localDateString(),
        venue: venueInput.value.trim(),
        author: authorInput.value.trim() || '아카라카',
        description: descInput.value.trim(),
        tags,
        mediaUrl,
        thumbnail,
        mediaId,
        likes: 0,
        isCustom: true
      };

      addCustomMemory(newMemory);
      state.memories = await loadMemories(true);
      dialog.close();
      render();
      toast('✨ 우리들의 기록에 새 이야기가 등록되었습니다.');
    } catch (err) {
      console.error(err);
      toast('기록 등록 중 오류가 발생했습니다: ' + err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = '기록 올리기';
    }
  };

  dialog.showModal();
}

export function openMemoryLightboxModal(memory) {
  const dialog = document.getElementById('memory-lightbox-dialog');
  if (!dialog) return;

  const titleEl = document.getElementById('lightbox-title');
  const badgeEl = document.getElementById('lightbox-badge');
  const containerEl = document.getElementById('lightbox-media-container');
  const descEl = document.getElementById('lightbox-desc');
  const metaEl = document.getElementById('lightbox-meta');
  const closeBtn = document.getElementById('memory-lightbox-close');

  const cleanupLightbox = () => {
    while (activePlayers.length) {
      const ap = activePlayers.pop();
      if (ap && typeof ap.destroy === 'function') ap.destroy();
    }
    containerEl.replaceChildren();
    const actionWrap = document.getElementById('lightbox-action-wrap');
    if (actionWrap) actionWrap.replaceChildren();
  };

  if (closeBtn) closeBtn.onclick = () => { cleanupLightbox(); dialog.close(); };
  dialog.onclick = (e) => {
    if (e.target === dialog) { cleanupLightbox(); dialog.close(); }
  };
  dialog.onclose = () => cleanupLightbox();

  titleEl.textContent = memory.title;
  badgeEl.textContent = memory.category || (memory.type === 'shorts' ? '숏츠' : '영상');
  descEl.textContent = memory.description || '';
  const authorDisplay = memory.author || memory.artist || memory.uploader;
  metaEl.textContent = `📅 ${memory.date || ''} ${memory.venue ? `· 📍 ${memory.venue}` : ''} ${authorDisplay ? `· 👤 ${authorDisplay}` : ''}`;
  const actionWrap = document.getElementById('lightbox-action-wrap');
  if (actionWrap) {
    actionWrap.replaceChildren(
      memory.songId ? button('🎵 연습실 바로가기 ↗', () => {
        cleanupLightbox();
        dialog.close();
        navigate({song: memory.songId});
      }, 'button primary small', 'music', {title: '이 곡 파트별 연습실로 바로 이동'}) : null
    );
  }

  containerEl.replaceChildren();

  const isYouTube = Boolean((memory.videoUrl && (memory.videoUrl.includes('youtube') || memory.videoUrl.includes('youtu.be'))) ||
                            (memory.mediaUrl && (memory.mediaUrl.includes('youtube') || memory.mediaUrl.includes('youtu.be'))));
  const videoUrl = memory.videoUrl || memory.mediaUrl;

  if (memory.type === 'shorts' || (isYouTube && videoUrl && videoUrl.includes('/shorts/'))) {
    const playerHost = el('div', {style: 'width: 100%; max-width: 380px; aspect-ratio: 9/16; max-height: 60vh; margin: 0 auto;'});
    const p = createPlayer(playerHost, { type: 'video', url: videoUrl }, memory.title);
    if (p && typeof p.mount === 'function') {
      p.mount();
    }
    activePlayers.push(p);
    containerEl.append(playerHost);
  } else if (isYouTube) {
    const playerHost = el('div', {style: 'width: 100%; max-width: 720px; aspect-ratio: 16/9; max-height: 60vh; margin: 0 auto;'});
    const p = createPlayer(playerHost, { type: 'video', url: videoUrl }, memory.title);
    if (p && typeof p.mount === 'function') {
      p.mount();
    }
    activePlayers.push(p);
    containerEl.append(playerHost);
  } else if (memory.type === 'video' || memory.sourceType === 'file' || memory.blobUrl || (memory.mediaUrl && /\.(mp4|webm|mov)$/i.test(memory.mediaUrl))) {
    const videoSrc = memory.blobUrl || memory.mediaUrl;
    const videoEl = el('video', {
      controls: true,
      autoplay: true,
      src: videoSrc,
      style: 'max-width: 100%; max-height: 60vh; border-radius: 8px;'
    });
    activePlayers.push({
      destroy: () => { videoEl.pause(); videoEl.src = ''; }
    });
    containerEl.append(videoEl);
  } else {
    const imgUrl = memory.mediaUrl || memory.thumbnail;
    const imgEl = el('img', {
      src: imgUrl,
      alt: memory.title,
      style: 'max-width: 100%; max-height: 60vh; object-fit: contain;'
    });
    containerEl.append(imgEl);
  }

  dialog.showModal();
}

export function renderMemories() {
  const categoryOptions = ['전체', '숏츠 영상', '사진 앨범', '비하인드', '공연 추억'];

  const heading = el('div', {class: 'page-heading'},
    el('div', {style: 'display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;'},
      el('div', {},
        el('p', {class: 'eyebrow', text: 'OUR MOMENTS & STORIES'}),
        el('h1', {text: '우리들의 기록'}),
        el('p', {text: '아카라카의 무대 뒤 이야기, 숏츠 영상, 사진 앨범. 함께 만들어가는 소중한 순간들을 기록합니다.'})
      ),
      button('+ 우리들의 기록 올리기', () => openUploadMemoryModal(), 'button primary small', 'camera')
    )
  );

  const categoryChips = el('div', {class: 'chip-group', style: 'margin-bottom: 24px;'},
    categoryOptions.map(cat => button(cat, () => {
      state.memoryFilters.category = cat === '전체' ? '' : cat;
      for (const btn of categoryChips.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.textContent.trim() === cat);
      }
      updateMemoryList();
    }, `chip${(state.memoryFilters.category === cat || (!state.memoryFilters.category && cat === '전체')) ? ' active' : ''}`))
  );

  const gridContainer = el('div', {class: 'memory-grid'});

  function getFilteredMemories() {
    const cat = state.memoryFilters.category || '';
    if (!cat) return state.memories;
    return state.memories.filter(m => m.category === cat || (cat === '숏츠 영상' && m.type === 'shorts') || (cat === '사진 앨범' && m.type === 'photo'));
  }

  function updateMemoryList() {
    const filtered = getFilteredMemories();
    if (!filtered.length) {
      gridContainer.replaceChildren(
        emptyState('등록된 기록이 아직 없어요', '연습실 숏츠 영상이나 무대 사진을 첫 번째로 올려보세요!', button('+ 기록 올리기', () => openUploadMemoryModal(), 'button primary small'))
      );
      return;
    }

    gridContainer.replaceChildren(...filtered.map(mem => {
      const isShorts = mem.type === 'shorts';
      const thumbUrl = mem.thumbnail || mem.mediaUrl || 'https://img.youtube.com/vi/kJ0nfArx9GI/hqdefault.jpg';

      const mediaWrap = el('div', {
        class: `memory-media-wrap${isShorts ? ' is-shorts' : ''}`,
        onclick: () => openMemoryLightboxModal(mem)
      },
        el('img', {class: 'memory-thumb', src: thumbUrl, alt: mem.title, loading: 'lazy'}),
        el('span', {class: 'memory-type-pill', text: isShorts ? '📱 숏츠' : mem.type === 'video' ? '🎬 영상' : '📷 사진'}),
        el('div', {class: 'memory-play-btn'},
          el('div', {class: 'memory-play-circle'}, icon(isShorts || mem.type === 'video' ? 'play' : 'eye'))
        )
      );

      const titleNode = el('h2', {
        class: 'memory-card-title',
        text: mem.title,
        onclick: () => openMemoryLightboxModal(mem)
      });

      const descNode = mem.description ? el('p', {class: 'memory-card-desc', text: mem.description}) : null;

      const tagsNode = mem.tags?.length ? el('div', {class: 'memory-tags-row'},
        mem.tags.map(t => el('span', {class: 'memory-tag', text: `#${t}`}))
      ) : null;

      const footer = el('div', {class: 'memory-footer'},
        el('span', {text: `📅 ${mem.date || ''} ${mem.venue ? `· ${mem.venue}` : ''}`}),
        mem.isCustom ? el('div', {style: 'display: flex; align-items: center; gap: 8px;'},
          button('삭제', async (e) => {
            e.stopPropagation();
            if (confirm(`'${mem.title}' 기록을 삭제할까요?`)) {
              await deleteCustomMemory(mem.id);
              state.memories = await loadMemories(true);
              render();
              toast('기록을 삭제했습니다.');
            }
          }, 'button secondary small danger', 'trash')
        ) : null
      );

      const body = el('div', {class: 'memory-body'}, titleNode, descNode, tagsNode, footer);

      return el('article', {class: 'memory-card'}, mediaWrap, body);
    }));
  }

  updateMemoryList();
  app.append(heading, categoryChips, gridContainer);
}
