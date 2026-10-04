import { read, write } from './storage.js';

let cachedPerformances = null;
let cachedRehearsals = null;

export async function loadPerformances() {
  if (cachedPerformances) return cachedPerformances;
  try {
    const res = await fetch('./data/performances.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('공연 데이터를 불러올 수 없습니다.');
    const json = await res.json();
    cachedPerformances = Array.isArray(json.performances) ? json.performances : [];
  } catch (error) {
    console.warn('loadPerformances error:', error);
    cachedPerformances = [];
  }
  return cachedPerformances;
}

export async function loadRehearsals() {
  if (cachedRehearsals) return cachedRehearsals;
  try {
    const res = await fetch('./data/rehearsals.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('연습 일지 데이터를 불러올 수 없습니다.');
    const json = await res.json();
    cachedRehearsals = Array.isArray(json.rehearsals) ? json.rehearsals : [];
    initFeedbacksFromData(cachedRehearsals);
  } catch (error) {
    console.warn('loadRehearsals error:', error);
    cachedRehearsals = [];
  }
  return cachedRehearsals;
}

/**
 * Initialize public feedback list in storage if empty, incorporating defaults.
 */
function initFeedbacksFromData(rehearsals) {
  const existing = read('team_feedbacks', null);
  if (!existing) {
    const defaults = [];
    for (const reh of rehearsals) {
      if (Array.isArray(reh.initialFeedbacks)) {
        for (const fb of reh.initialFeedbacks) {
          defaults.push({
            ...fb,
            rehearsalId: reh.id,
            songId: reh.songId,
          });
        }
      }
    }
    write('team_feedbacks', defaults);
  }
}

export function getAllFeedbacks(rehearsalId = null) {
  const all = read('team_feedbacks', []);
  if (!Array.isArray(all)) return [];
  if (rehearsalId) {
    return all.filter((fb) => fb.rehearsalId === rehearsalId);
  }
  return all;
}

export function addFeedback({ rehearsalId, songId, author, part, time, content }) {
  if (!content || !content.trim()) return null;
  const all = getAllFeedbacks();
  const newFeedback = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    rehearsalId,
    songId: songId || '',
    author: (author && author.trim()) || '익명의 단원',
    part: part || 'all',
    time: typeof time === 'number' && Number.isFinite(time) ? Math.max(0, time) : 0,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    likes: 0,
  };
  const updated = [newFeedback, ...all];
  write('team_feedbacks', updated);
  return newFeedback;
}

export function toggleFeedbackLike(feedbackId) {
  const all = getAllFeedbacks();
  const likedKeys = new Set(read('liked_feedbacks', []));
  const isLiked = likedKeys.has(feedbackId);

  const updated = all.map((fb) => {
    if (fb.id === feedbackId) {
      const likes = Math.max(0, (fb.likes || 0) + (isLiked ? -1 : 1));
      return { ...fb, likes };
    }
    return fb;
  });

  if (isLiked) {
    likedKeys.delete(feedbackId);
  } else {
    likedKeys.add(feedbackId);
  }
  write('liked_feedbacks', [...likedKeys]);
  write('team_feedbacks', updated);
  return !isLiked;
}

export function getPerformancesForSong(performances, songId) {
  if (!Array.isArray(performances) || !songId) return [];
  return performances.filter((perf) =>
    Array.isArray(perf.setlist) && perf.setlist.some((item) => item.songId === songId)
  );
}

export function getRehearsalsForSong(rehearsals, songId) {
  if (!Array.isArray(rehearsals) || !songId) return [];
  return rehearsals.filter((reh) => reh.songId === songId);
}
