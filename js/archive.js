import { read, write } from './storage.js';
import { getMediaBlobUrl, deleteMediaFile } from './mediaStorage.js';

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

export async function loadRehearsals(forceReload = false) {
  if (cachedRehearsals && !forceReload) return cachedRehearsals;
  let serverRehearsals = [];
  try {
    const res = await fetch('./data/rehearsals.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('연습 일지 데이터를 불러올 수 없습니다.');
    const json = await res.json();
    serverRehearsals = Array.isArray(json.rehearsals) ? json.rehearsals : [];
  } catch (error) {
    console.warn('loadRehearsals error:', error);
    serverRehearsals = [];
  }

  // Load custom rehearsals and attached media overrides from local storage
  const customRehearsals = read('custom_rehearsals', []);
  const mediaOverrides = read('rehearsal_media_overrides', {});

  const allRehearsals = [...(Array.isArray(customRehearsals) ? customRehearsals : []), ...serverRehearsals];

  // Resolve any local blob URLs for attached audio/video
  for (const reh of allRehearsals) {
    const override = mediaOverrides[reh.id];
    if (override && override.mediaId) {
      const blobUrl = await getMediaBlobUrl(override.mediaId);
      if (blobUrl) {
        if (override.isVideo) {
          reh.video = {
            type: 'local-video',
            url: blobUrl,
            label: override.fileName || '업로드된 연습 영상'
          };
        } else {
          reh.audio = {
            url: blobUrl,
            label: override.fileName || '업로드된 연습 녹음본',
            duration: override.duration || 0,
            isLocal: true
          };
        }
      }
    }
  }

  initFeedbacksFromData(allRehearsals);
  cachedRehearsals = allRehearsals;
  return cachedRehearsals;
}

/**
 * Initialize public feedback list in storage with seed version check.
 */
function initFeedbacksFromData(rehearsals) {
  const version = read('feedbacks_seed_v', 0);
  if (version < 2) {
    // Replace old example feedbacks with Bohemian Rhapsody & actual data
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
    write('feedbacks_seed_v', 2);
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

export function addCustomRehearsal(newReh) {
  const customList = read('custom_rehearsals', []);
  const updated = [newReh, ...customList];
  write('custom_rehearsals', updated);
  cachedRehearsals = null;
  return newReh;
}

export function attachMediaToRehearsal(rehearsalId, mediaInfo) {
  const overrides = read('rehearsal_media_overrides', {});
  overrides[rehearsalId] = mediaInfo;
  write('rehearsal_media_overrides', overrides);
  cachedRehearsals = null;
}

export async function deleteCustomRehearsal(rehearsalId) {
  const customList = read('custom_rehearsals', []);
  const updated = customList.filter(r => r.id !== rehearsalId);
  write('custom_rehearsals', updated);

  const overrides = read('rehearsal_media_overrides', {});
  const override = overrides[rehearsalId];
  if (override?.mediaId) {
    await deleteMediaFile(override.mediaId);
    delete overrides[rehearsalId];
    write('rehearsal_media_overrides', overrides);
  }
  cachedRehearsals = null;
}

let cachedScores = null;
let cachedMemories = null;

export async function loadScores(forceReload = false) {
  if (cachedScores && !forceReload) return cachedScores;
  let serverScores = [];
  try {
    const res = await fetch('./data/scores.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('악보 데이터를 불러올 수 없습니다.');
    const json = await res.json();
    serverScores = Array.isArray(json.scores) ? json.scores : [];
  } catch (error) {
    console.warn('loadScores error:', error);
    serverScores = [];
  }

  const customScores = read('custom_scores', []);
  const allScores = [...(Array.isArray(customScores) ? customScores : []), ...serverScores];

  // Resolve blob URLs for scores stored in IndexedDB
  for (const sc of allScores) {
    if (sc.mediaId) {
      const blobUrl = await getMediaBlobUrl(sc.mediaId);
      if (blobUrl) {
        sc.blobUrl = blobUrl;
      }
    }
  }

  cachedScores = allScores;
  return cachedScores;
}

export function addCustomScore(newScore) {
  const customList = read('custom_scores', []);
  const updated = [newScore, ...customList];
  write('custom_scores', updated);
  cachedScores = null;
  return newScore;
}

export async function deleteCustomScore(scoreId) {
  const customList = read('custom_scores', []);
  const target = customList.find(s => s.id === scoreId);
  const updated = customList.filter(s => s.id !== scoreId);
  write('custom_scores', updated);
  if (target?.mediaId) {
    await deleteMediaFile(target.mediaId);
  }
  cachedScores = null;
}

export function getScoresForSong(scores, songId) {
  if (!Array.isArray(scores) || !songId) return [];
  return scores.filter(s => s.songId === songId);
}

export async function loadMemories(forceReload = false) {
  if (cachedMemories && !forceReload) return cachedMemories;
  let serverMemories = [];
  try {
    const res = await fetch('./data/memories.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('기록 데이터를 불러올 수 없습니다.');
    const json = await res.json();
    serverMemories = Array.isArray(json.memories) ? json.memories : [];
  } catch (error) {
    console.warn('loadMemories error:', error);
    serverMemories = [];
  }

  const customMemories = read('custom_memories', []);
  const allMemories = [...(Array.isArray(customMemories) ? customMemories : []), ...serverMemories];

  // Resolve blob URLs for memories stored in IndexedDB
  for (const m of allMemories) {
    if (m.mediaId) {
      const blobUrl = await getMediaBlobUrl(m.mediaId);
      if (blobUrl) {
        m.mediaUrl = blobUrl;
        if (m.type === 'photo' || !m.thumbnail) {
          m.thumbnail = blobUrl;
        }
      }
    }
  }

  // Sync likes with liked_memories
  const customLikeCounts = read('memory_like_counts', {});
  for (const m of allMemories) {
    if (typeof customLikeCounts[m.id] === 'number') {
      m.likes = customLikeCounts[m.id];
    }
  }

  cachedMemories = allMemories;
  return cachedMemories;
}

export function addCustomMemory(newMemory) {
  const customList = read('custom_memories', []);
  const updated = [newMemory, ...customList];
  write('custom_memories', updated);
  cachedMemories = null;
  return newMemory;
}

export async function deleteCustomMemory(memoryId) {
  const customList = read('custom_memories', []);
  const target = customList.find(m => m.id === memoryId);
  const updated = customList.filter(m => m.id !== memoryId);
  write('custom_memories', updated);
  if (target?.mediaId) {
    await deleteMediaFile(target.mediaId);
  }
  cachedMemories = null;
}

export function toggleMemoryLike(memoryId) {
  const likedKeys = new Set(read('liked_memories', []));
  const customLikeCounts = read('memory_like_counts', {});
  const isLiked = likedKeys.has(memoryId);

  let currentLikes = 0;
  if (cachedMemories) {
    const mem = cachedMemories.find(m => m.id === memoryId);
    if (mem) {
      currentLikes = mem.likes || 0;
    }
  }
  if (typeof customLikeCounts[memoryId] === 'number') {
    currentLikes = customLikeCounts[memoryId];
  }

  const nextLikes = Math.max(0, currentLikes + (isLiked ? -1 : 1));
  customLikeCounts[memoryId] = nextLikes;
  write('memory_like_counts', customLikeCounts);

  if (isLiked) {
    likedKeys.delete(memoryId);
  } else {
    likedKeys.add(memoryId);
  }
  write('liked_memories', [...likedKeys]);

  if (cachedMemories) {
    const mem = cachedMemories.find(m => m.id === memoryId);
    if (mem) mem.likes = nextLikes;
  }

  return { isLiked: !isLiked, count: nextLikes };
}

let cachedEducation = null;

export async function loadEducation(forceReload = false) {
  if (cachedEducation && !forceReload) return cachedEducation;
  let serverResources = [];
  try {
    const res = await fetch('./data/education.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('교육 자료 데이터를 불러올 수 없습니다.');
    const json = await res.json();
    serverResources = Array.isArray(json.resources) ? json.resources : [];
  } catch (error) {
    console.warn('loadEducation error:', error);
    serverResources = [];
  }

  const customEdu = read('custom_education', []);
  const allEdu = [...(Array.isArray(customEdu) ? customEdu : []), ...serverResources];

  // Resolve blob URLs for materials stored in IndexedDB
  for (const item of allEdu) {
    if (item.mediaId) {
      const blobUrl = await getMediaBlobUrl(item.mediaId);
      if (blobUrl) {
        item.blobUrl = blobUrl;
      }
    }
  }

  cachedEducation = allEdu;
  return cachedEducation;
}

export function addCustomEducation(newEdu) {
  const customList = read('custom_education', []);
  const updated = [newEdu, ...customList];
  write('custom_education', updated);
  cachedEducation = null;
  return newEdu;
}

export async function deleteCustomEducation(eduId) {
  const customList = read('custom_education', []);
  const target = customList.find(e => e.id === eduId);
  const updated = customList.filter(e => e.id !== eduId);
  write('custom_education', updated);
  if (target?.mediaId) {
    await deleteMediaFile(target.mediaId);
  }
  cachedEducation = null;
}

