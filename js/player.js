import {
  requestWakeLock,
  releaseWakeLock,
  startAudioAnchor,
  stopAudioAnchor,
  updateMediaSession,
  setMediaSessionPlaybackState,
  enterPocketMode,
  exitPocketMode,
} from './backgroundPlay.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,150}$/;

/** Parse a media record without accepting executable schemes or look-alike hosts. */
export function parseYouTube(media) {
  const type = media && typeof media === 'object' ? media.type : '';
  const rawURL = media && typeof media.url === 'string' ? media.url.trim() : '';
  const result = {
    ok: false,
    empty: !rawURL,
    error: '',
    embedUrl: '',
    originalUrl: '',
    videoId: null,
    playlistId: null,
    type: typeof type === 'string' ? type : '',
  };
  if (!rawURL) {
    result.error = '아직 등록된 연습 영상이 없습니다.';
    return result;
  }
  if (type !== 'video' && type !== 'playlist') {
    result.error = '미디어 종류는 video 또는 playlist여야 합니다.';
    return result;
  }
  let url;
  try {
    url = new URL(rawURL);
  } catch {
    result.error = '올바른 YouTube 주소를 입력해 주세요.';
    return result;
  }
  if (!['https:', 'http:'].includes(url.protocol)
      || !YOUTUBE_HOSTS.has(url.hostname)
      || url.username || url.password || url.port) {
    result.error = 'YouTube의 HTTP 또는 HTTPS 주소만 사용할 수 있습니다.';
    return result;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  let videoId = null;
  const playlistId = url.searchParams.get('list');
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    if (segments.length === 1) videoId = segments[0];
  } else if (segments.length === 1 && segments[0] === 'watch') {
    videoId = url.searchParams.get('v');
  } else if (segments.length === 2 && ['embed', 'shorts', 'live'].includes(segments[0])) {
    videoId = segments[1] === 'videoseries' ? null : segments[1];
  }

  result.videoId = videoId && VIDEO_ID.test(videoId) ? videoId : null;
  result.playlistId = playlistId && PLAYLIST_ID.test(playlistId) ? playlistId : null;
  const supportedPath = (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be')
    ? segments.length === 1
    : (segments.length === 1 && ['watch', 'playlist'].includes(segments[0]))
      || (segments.length === 2 && ['embed', 'shorts', 'live'].includes(segments[0]));
  if (!supportedPath) {
    result.error = '영상 또는 재생목록으로 연결되는 YouTube 주소를 입력해 주세요.';
    return result;
  }
  if (type === 'video' && !result.videoId) {
    result.error = '유효한 영상 ID를 찾을 수 없습니다. 영상 주소와 종류를 확인해 주세요.';
    return result;
  }
  if (type === 'playlist' && !result.playlistId) {
    result.error = '유효한 재생목록 ID를 찾을 수 없습니다. list가 포함된 주소를 입력해 주세요.';
    return result;
  }
  url.protocol = 'https:';
  result.originalUrl = url.href;
  result.embedUrl = type === 'video'
    ? `https://www.youtube-nocookie.com/embed/${result.videoId}`
    : `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(result.playlistId)}`;
  result.ok = true;
  return result;
}

/** Create an inert preview; a YouTube iframe exists only after an explicit play action. */
export function createPlayer(container, media, title = 'AcaRaca 연습 영상') {
  const parsed = parseYouTube(media);
  const shell = document.createElement('div');
  shell.className = 'player-shell';
  const screen = document.createElement('div');
  screen.className = 'player-screen';
  shell.append(screen);

  let isLandscapeExpanded = false;
  let rotateAngle = 90;

  const pocketBtn = document.createElement('button');
  pocketBtn.type = 'button';
  pocketBtn.className = 'player-pocket-btn';
  pocketBtn.setAttribute('aria-label', '화면 끄고 계속 듣기 (포켓 절전 모드)');
  pocketBtn.innerHTML = '<span>🔒 절전</span>';
  pocketBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    enterPocketMode({
      title,
      partLabel: 'AcaRaca 연습 영상 · 백그라운드 재생 중',
      onUnlock: () => {}
    });
  });

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'player-expand-btn';
  expandBtn.setAttribute('aria-label', '가로로 확대해서 큰 화면으로 보기');
  expandBtn.innerHTML = '<span class="expand-icon" aria-hidden="true">⛶</span><span>가로 확대</span>';

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.className = 'theater-exit-btn';
  exitBtn.setAttribute('aria-label', '세로 화면으로 돌아가기');
  exitBtn.innerHTML = '<span>✕ 화면 복귀</span>';

  const rotateBtn = document.createElement('button');
  rotateBtn.type = 'button';
  rotateBtn.className = 'theater-rotate-btn';
  rotateBtn.setAttribute('aria-label', '화면 회전 방향 전환 (180도)');
  rotateBtn.innerHTML = '<span>🔄 회전</span>';

  async function toggleLandscapeExpanded(forceState) {
    if (destroyed) return;
    isLandscapeExpanded = (typeof forceState === 'boolean') ? forceState : !isLandscapeExpanded;
    screen.classList.toggle('theater-landscape', isLandscapeExpanded);
    if (typeof document !== 'undefined') {
      document.body?.classList.toggle('has-landscape-player', isLandscapeExpanded);
    }

    if (isLandscapeExpanded) {
      if (!iframe) {
        mountFrame(currentTime);
      }
      try {
        if (screen.requestFullscreen) {
          await screen.requestFullscreen();
        } else if (screen.webkitRequestFullscreen) {
          await screen.webkitRequestFullscreen();
        }
      } catch (e) {}

      try {
        if (typeof window !== 'undefined' && window.screen?.orientation?.lock) {
          await window.screen.orientation.lock('landscape');
        }
      } catch (e) {}
    } else {
      try {
        if (typeof document !== 'undefined') {
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          }
        }
      } catch (e) {}

      try {
        if (typeof window !== 'undefined' && window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
      } catch (e) {}
    }
  }

  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLandscapeExpanded(true);
  });
  exitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLandscapeExpanded(false);
  });
  rotateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rotateAngle = rotateAngle === 90 ? 270 : 90;
    screen.style.setProperty('--theater-rotate-angle', `${rotateAngle}deg`);
  });

  function handleFullscreenChange() {
    if (typeof document !== 'undefined' && !document.fullscreenElement && !document.webkitFullscreenElement && isLandscapeExpanded) {
      toggleLandscapeExpanded(false);
    }
  }
  function handleKeyDown(e) {
    if (e.key === 'Escape' && isLandscapeExpanded) {
      toggleLandscapeExpanded(false);
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
  }

  let destroyed = false;
  let iframe = null;
  let isPlaying = false;
  let currentTime = 0;
  let currentRate = 1.0;
  let ticker = null;
  const stateListeners = [];
  let pendingSeek = null;

  function notifyChange() {
    for (const cb of stateListeners) {
      try { cb({ isPlaying, currentTime, currentRate, mounted: Boolean(iframe) }); } catch {}
    }
  }

  function syncMediaSession() {
    updateMediaSession({
      title,
      artist: 'AcaRaca 아카펠라',
      album: '파트 연습실',
      artwork: parsed.videoId ? `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg` : null,
      onPlay: () => {
        sendYT('playVideo', []);
        startAudioAnchor();
      },
      onPause: () => {
        sendYT('pauseVideo', []);
      },
      onSeekBackward: () => {
        const target = Math.max(0, currentTime - 5);
        currentTime = target;
        sendYT('seekTo', [target, true]);
      },
      onSeekForward: () => {
        const target = currentTime + 5;
        currentTime = target;
        sendYT('seekTo', [target, true]);
      },
      position: currentTime,
      playbackRate: currentRate,
    });
    setMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused');
  }

  function handleMessage(event) {
    if (!event.data) return;
    let data = event.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return; }
    }
    if (data && data.event === 'infoDelivery' && data.info) {
      if (typeof data.info.currentTime === 'number') {
        currentTime = data.info.currentTime;
      }
      if (typeof data.info.playerState === 'number') {
        isPlaying = (data.info.playerState === 1);
        if (data.info.playerState === 1 && pendingSeek !== null) {
          if (Math.abs(currentTime - pendingSeek) > 1.5) {
            sendYT('seekTo', [pendingSeek, true]);
          }
          pendingSeek = null;
        }
        if (data.info.playerState === 1) {
          requestWakeLock();
          startAudioAnchor();
          syncMediaSession();
        } else if (data.info.playerState === 2) {
          setMediaSessionPlaybackState('paused');
        }
      }
      if (typeof data.info.playbackRate === 'number') {
        currentRate = data.info.playbackRate;
      }
      notifyChange();
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }

  function sendYT(func, args = []) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    } catch {}
  }

  function mountFrame(startSeconds = 0) {
    if (!parsed.ok || destroyed) return;
    const initialTime = Math.max(0, Number(startSeconds) || 0);
    currentTime = initialTime;
    pendingSeek = initialTime;
    iframe = document.createElement('iframe');
    const embed = new URL(parsed.embedUrl);
    embed.searchParams.set('autoplay', '1');
    embed.searchParams.set('rel', '0');
    embed.searchParams.set('start', String(Math.floor(initialTime)));
    embed.searchParams.set('enablejsapi', '1');
    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
      embed.searchParams.set('origin', window.location.origin);
    }
    iframe.src = embed.href;
    iframe.className = 'player-frame';
    iframe.title = title;
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    screen.replaceChildren(iframe, pocketBtn, expandBtn, exitBtn, rotateBtn);
    isPlaying = true;
    requestWakeLock();
    startAudioAnchor();
    syncMediaSession();
    notifyChange();

    iframe.addEventListener('load', () => {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch {}
      if (pendingSeek !== null) {
        const sec = pendingSeek;
        sendYT('seekTo', [sec, true]);
        sendYT('playVideo', []);
        setTimeout(() => {
          if (!destroyed && iframe) {
            sendYT('seekTo', [sec, true]);
            sendYT('playVideo', []);
          }
        }, 250);
      }
    }, { once: true });

    if (!ticker && typeof setInterval !== 'undefined') {
      ticker = setInterval(() => {
        if (isPlaying) {
          currentTime = Math.max(0, currentTime + 0.5 * currentRate);
          notifyChange();
        }
      }, 500);
    }
  }

  if (parsed.ok) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'player-placeholder player-play';
    play.setAttribute('aria-label', `${title} 재생`);
    if (parsed.videoId) {
      const poster = document.createElement('img');
      poster.className = 'player-poster';
      poster.src = `https://i.ytimg.com/vi/${parsed.videoId}/hqdefault.jpg`;
      poster.alt = '';
      poster.loading = 'lazy';
      poster.addEventListener('error', () => poster.remove(), { once: true });
      play.append(poster);
    }
    const icon = document.createElement('span');
    icon.className = 'player-play-icon';
    icon.textContent = '▶';
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'player-play-label';
    label.textContent = parsed.type === 'playlist' ? '재생목록 재생' : '영상 재생';
    play.append(icon, label);
    play.addEventListener('click', () => mountFrame(0));
    screen.append(play, pocketBtn, expandBtn, exitBtn, rotateBtn);
    const link = document.createElement('a');
    link.className = 'button secondary player-external';
    link.href = parsed.originalUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'YouTube에서 열기 ↗';
    const help = document.createElement('p');
    help.className = 'player-help muted';
    help.textContent = '재생이 제한되면 YouTube에서 열기를 이용해 주세요.';
    shell.append(link, help);
  } else {
    const empty = document.createElement('div');
    empty.className = `player-placeholder ${parsed.empty ? 'player-empty' : 'player-error'}`;
    empty.setAttribute('role', 'status');
    const message = document.createElement('p');
    message.textContent = parsed.error;
    empty.append(message);
    screen.append(empty);
  }
  container.replaceChildren(shell);

  return {
    restart() { mountFrame(0); },
    mount(startSec = 0) { mountFrame(startSec); },
    seekRelative(delta) {
      const target = Math.max(0, currentTime + delta);
      currentTime = target;
      isPlaying = true;
      if (!iframe) {
        mountFrame(target);
        return;
      }
      pendingSeek = target;
      sendYT('seekTo', [target, true]);
      notifyChange();
      setTimeout(() => {
        if (!destroyed && iframe) {
          sendYT('seekTo', [target, true]);
        }
      }, 100);
    },
    seekTo(seconds) {
      const target = Math.max(0, Number(seconds) || 0);
      currentTime = target;
      isPlaying = true;
      if (!iframe) {
        mountFrame(target);
        return;
      }
      pendingSeek = target;
      sendYT('seekTo', [target, true]);
      sendYT('playVideo', []);
      notifyChange();
      setTimeout(() => {
        if (!destroyed && iframe) {
          sendYT('seekTo', [target, true]);
          sendYT('playVideo', []);
        }
      }, 100);
    },
    setRate(rate) {
      currentRate = rate;
      if (iframe) {
        sendYT('setPlaybackRate', [rate]);
      }
      notifyChange();
    },
    togglePlay() {
      if (!iframe) {
        mountFrame(currentTime);
        return;
      }
      if (isPlaying) {
        isPlaying = false;
        sendYT('pauseVideo', []);
      } else {
        isPlaying = true;
        sendYT('playVideo', []);
      }
      notifyChange();
    },
    play() {
      if (!iframe) {
        mountFrame(currentTime);
      } else {
        isPlaying = true;
        sendYT('playVideo', []);
        notifyChange();
      }
    },
    pause() {
      if (iframe) {
        isPlaying = false;
        sendYT('pauseVideo', []);
        notifyChange();
      }
    },
    getCurrentTime() { return currentTime; },
    getRate() { return currentRate; },
    isPlaying() { return isPlaying; },
    isMounted() { return Boolean(iframe); },
    onStateChange(cb) {
      stateListeners.push(cb);
      cb({ isPlaying, currentTime, currentRate, mounted: Boolean(iframe) });
    },
    toggleLandscape(force) { return toggleLandscapeExpanded(force); },
    isLandscape() { return isLandscapeExpanded; },
    enterPocketMode() {
      return enterPocketMode({
        title,
        partLabel: 'AcaRaca 연습 영상 · 백그라운드 재생 중',
        onUnlock: () => {}
      });
    },
    exitPocketMode() {
      return exitPocketMode();
    },
    destroy() {
      destroyed = true;
      releaseWakeLock();
      exitPocketMode();
      stopAudioAnchor();
      if (isLandscapeExpanded) {
        toggleLandscapeExpanded(false);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('keydown', handleKeyDown);
        document.body?.classList.remove('has-landscape-player');
      }
      try {
        if (typeof window !== 'undefined' && window.screen?.orientation?.unlock) {
          window.screen.orientation.unlock();
        }
      } catch (e) {}
      if (ticker) clearInterval(ticker);
      if (typeof window !== 'undefined') {
        window.removeEventListener('message', handleMessage);
      }
      shell.remove();
    },
  };
}

/** Formats seconds into mm:ss (or --:-- when empty/invalid) */
export function formatPlayerTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--';
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Creates an A-B section repeat looper for practice.
 * Supports setting A/B points, fine-tuning (-1s/+1s), quick presets (5s, 10s, 15s),
 * toggle, and high-frequency turnaround watcher.
 */
export function createSectionLooper(player, options = {}) {
  const { onStateChange } = options;
  let loopStart = null;
  let loopEnd = null;
  let isLooping = false;
  let loopTimer = null;
  let lastSeekTime = 0;

  function notify() {
    if (typeof onStateChange === 'function') {
      onStateChange({
        loopStart,
        loopEnd,
        isLooping,
        duration: (loopStart !== null && loopEnd !== null) ? Math.max(0, Math.round((loopEnd - loopStart) * 10) / 10) : 0
      });
    }
  }

  function checkLoopTick() {
    if (!isLooping || loopStart === null || loopEnd === null) return;
    const cur = typeof player?.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
    const now = Date.now();
    if (cur >= loopEnd && (now - lastSeekTime > 350)) {
      lastSeekTime = now;
      if (typeof player?.seekTo === 'function') {
        player.seekTo(loopStart);
      }
    }
  }

  function startWatcher() {
    if (loopTimer) clearInterval(loopTimer);
    if (typeof setInterval !== 'undefined') {
      loopTimer = setInterval(checkLoopTick, 100);
    }
  }

  function stopWatcher() {
    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
  }

  return {
    setStart(sec = null) {
      const cur = sec !== null ? Number(sec) : (player?.getCurrentTime?.() ?? 0);
      loopStart = Math.max(0, Math.round(cur * 10) / 10);
      if (loopEnd !== null && loopStart >= loopEnd) {
        loopEnd = Math.round((loopStart + 5) * 10) / 10;
      }
      notify();
      return loopStart;
    },
    setEnd(sec = null) {
      const cur = sec !== null ? Number(sec) : (player?.getCurrentTime?.() ?? 0);
      loopEnd = Math.max(0, Math.round(cur * 10) / 10);
      if (loopStart !== null && loopEnd <= loopStart) {
        loopStart = Math.max(0, Math.round((loopEnd - 5) * 10) / 10);
      }
      notify();
      return loopEnd;
    },
    nudgeStart(delta) {
      if (loopStart === null) {
        loopStart = Math.max(0, Math.round((player?.getCurrentTime?.() ?? 0) * 10) / 10);
      }
      loopStart = Math.max(0, Math.round((loopStart + delta) * 10) / 10);
      if (loopEnd !== null && loopStart >= loopEnd) {
        loopEnd = Math.round((loopStart + 1) * 10) / 10;
      }
      notify();
      return loopStart;
    },
    nudgeEnd(delta) {
      if (loopEnd === null) {
        loopEnd = Math.max(5, Math.round(((player?.getCurrentTime?.() ?? 0) + 5) * 10) / 10);
      }
      loopEnd = Math.max(1, Math.round((loopEnd + delta) * 10) / 10);
      if (loopStart !== null && loopEnd <= loopStart) {
        loopStart = Math.max(0, Math.round((loopEnd - 1) * 10) / 10);
      }
      notify();
      return loopEnd;
    },
    setQuickPreset(duration) {
      const dur = Math.max(1, Number(duration) || 5);
      const cur = Math.max(0, Math.round((player?.getCurrentTime?.() ?? 0) * 10) / 10);
      loopStart = cur;
      loopEnd = Math.round((cur + dur) * 10) / 10;
      isLooping = true;
      startWatcher();
      if (typeof player?.seekTo === 'function') {
        player.seekTo(loopStart);
      }
      notify();
      return { loopStart, loopEnd };
    },
    toggleLoop() {
      if (isLooping) {
        isLooping = false;
        stopWatcher();
      } else {
        if (loopStart === null && loopEnd === null) {
          const cur = Math.max(0, Math.round((player?.getCurrentTime?.() ?? 0) * 10) / 10);
          loopStart = cur;
          loopEnd = Math.round((cur + 10) * 10) / 10;
        } else if (loopStart === null) {
          loopStart = Math.max(0, Math.round((loopEnd - 5) * 10) / 10);
        } else if (loopEnd === null) {
          loopEnd = Math.round((loopStart + 5) * 10) / 10;
        }
        isLooping = true;
        startWatcher();
        const cur = player?.getCurrentTime?.() ?? 0;
        if (cur < loopStart || cur >= loopEnd) {
          if (typeof player?.seekTo === 'function') {
            player.seekTo(loopStart);
          }
        }
      }
      notify();
      return isLooping;
    },
    jumpToStart() {
      if (loopStart !== null && typeof player?.seekTo === 'function') {
        player.seekTo(loopStart);
      }
    },
    clear() {
      loopStart = null;
      loopEnd = null;
      isLooping = false;
      stopWatcher();
      notify();
    },
    checkTick() {
      checkLoopTick();
    },
    getState() {
      return {
        loopStart,
        loopEnd,
        isLooping,
        duration: (loopStart !== null && loopEnd !== null) ? Math.max(0, Math.round((loopEnd - loopStart) * 10) / 10) : 0
      };
    },
    destroy() {
      stopWatcher();
    }
  };
}

