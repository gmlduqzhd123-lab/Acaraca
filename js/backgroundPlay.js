/**
 * Mobile Background Play, Media Session, Wake Lock, and Pocket Mode.
 * Helps prevent accidental touches and provides system media controls.
 */

import { read, write } from './storage.js';

const SILENT_WAV_BASE64 = 'UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
const SILENT_WAV_URI = `data:audio/wav;base64,${SILENT_WAV_BASE64}`;

let wakeLockSentinel = null;
let userWantsWakeLock = false;
let audioAnchor = null;
let currentPocketOverlay = null;
let lastTapTime = 0;
let isAudioAnchorRunning = false;

/**
 * Get mobile background playback settings.
 */
export function getBackgroundSettings() {
  return {
    autoResume: read('bgAutoResume', true) ?? true,
    keepAwake: read('bgKeepAwake', true) ?? true,
  };
}

/**
 * Update mobile background playback setting.
 */
export function setBackgroundSetting(key, val) {
  return write(key, val);
}

/**
 * Request Screen Wake Lock to prevent the screen from automatically sleeping or locking.
 */
export async function requestWakeLock() {
  userWantsWakeLock = true;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }
  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) return true;
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    return true;
  } catch (err) {
    console.warn('[AcaRaca] WakeLock request error:', err);
    wakeLockSentinel = null;
    return false;
  }
}

/**
 * Release Screen Wake Lock.
 */
export async function releaseWakeLock() {
  userWantsWakeLock = false;
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

export function isWakeLockActive() {
  return Boolean(wakeLockSentinel && !wakeLockSentinel.released);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    const keepAwake = read('bgKeepAwake', true) ?? true;
    if (document.visibilityState === 'visible' && (userWantsWakeLock || currentPocketOverlay || keepAwake)) {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        try {
          if (!wakeLockSentinel || wakeLockSentinel.released) {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel.addEventListener('release', () => {
              wakeLockSentinel = null;
            });
          }
        } catch {}
      }
    }
  });
}

/**
 * Start a silent background audio loop.
 * Creates an active audio session recognized by iOS/Android OS,
 * keeping the tab alive and enabling Lock Screen Media Controls.
 */
export function startAudioAnchor() {
  if (typeof window === 'undefined') return;
  if (!audioAnchor) {
    audioAnchor = new Audio(SILENT_WAV_URI);
    audioAnchor.loop = true;
    audioAnchor.volume = 0.001; // Nearly silent carrier
  }
  if (!isAudioAnchorRunning || (audioAnchor && audioAnchor.paused)) {
    const playPromise = audioAnchor.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        isAudioAnchorRunning = true;
      }).catch((e) => {
        console.warn('[AcaRaca] Audio anchor play prevented by policy:', e);
      });
    }
  }
}

export function stopAudioAnchor() {
  if (audioAnchor) {
    try {
      audioAnchor.pause();
      audioAnchor.currentTime = 0;
    } catch {}
    isAudioAnchorRunning = false;
  }
}

/**
 * Update system Lock Screen / Notification Media Controls via Media Session API.
 */
export function updateMediaSession({
  title = 'AcaRaca 아카펠라',
  artist = '우리의 아카펠라 연습실',
  album = 'AcaRaca',
  artwork = null,
  onPlay = null,
  onPause = null,
  onSeekBackward = null,
  onSeekForward = null,
  onPreviousTrack = null,
  onNextTrack = null,
  duration = 0,
  position = 0,
  playbackRate = 1.0,
} = {}) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return false;
  }

  try {
    const defaultArtwork = [
      { src: './assets/icons/logo.png', sizes: '512x512', type: 'image/png' },
      { src: './assets/images/acaraca-seal.png', sizes: '256x256', type: 'image/png' },
    ];

    const artworkList = artwork
      ? (Array.isArray(artwork) ? artwork : [{ src: artwork, sizes: '512x512', type: 'image/jpeg' }])
      : defaultArtwork;

    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: artworkList,
      });
    }

    // Register lock screen and notification action handlers
    const actions = [
      ['play', onPlay],
      ['pause', onPause],
      ['seekbackward', onSeekBackward || (() => {})],
      ['seekforward', onSeekForward || (() => {})],
      ['previoustrack', onPreviousTrack],
      ['nexttrack', onNextTrack],
    ];

    for (const [actionName, handler] of actions) {
      try {
        if (typeof handler === 'function') {
          navigator.mediaSession.setActionHandler(actionName, () => {
            handler();
            // Start audio anchor to keep session active when user resumes from lock screen
            if (actionName === 'play') {
              startAudioAnchor();
            }
          });
        } else {
          navigator.mediaSession.setActionHandler(actionName, null);
        }
      } catch (err) {
        console.warn(`[AcaRaca] MediaSession action ${actionName} error:`, err);
      }
    }

    if (duration > 0 && typeof navigator.mediaSession.setPositionState === 'function') {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: Math.max(0.25, playbackRate || 1.0),
          position: Math.max(0, Math.min(position, duration)),
        });
      } catch (e) {}
    }

    return true;
  } catch (err) {
    console.warn('[AcaRaca] updateMediaSession error:', err);
    return false;
  }
}

/**
 * Set Media Session Playback State ('playing', 'paused', 'none').
 */
export function setMediaSessionPlaybackState(state) {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = state;
    } catch {}
  }
}

/**
 * Enter Pocket Lock Mode.
 * Covers screen with a black overlay to block accidental touches while keeping playback alive.
 * Note: The screen remains ON and consumes battery.
 */
export function enterPocketMode({
  title = '연습곡',
  partLabel = '전체 파트',
  onUnlock = null,
} = {}) {
  if (typeof document === 'undefined') return null;
  if (currentPocketOverlay) return currentPocketOverlay;

  // Request Wake Lock so the OS keeps screen awake while in black screen
  requestWakeLock();
  startAudioAnchor();

  const overlay = document.createElement('div');
  overlay.id = 'pocket-mode-overlay';
  overlay.className = 'pocket-mode-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '화면 터치 방지 포켓 모드');

  overlay.innerHTML = `
    <div class="pocket-top">
      <span class="pocket-lock-icon">🔒</span>
      <span class="pocket-mode-badge">터치 방지 모드 (화면 켜짐 유지 중)</span>
    </div>
    <div class="pocket-center">
      <p class="pocket-song-title">${title}</p>
      <p class="pocket-part-label">${partLabel}</p>
      <div class="pocket-pulse-wrap">
        <span class="pocket-pulse-dot"></span>
        <span class="pocket-pulse-text">음악이 백그라운드에서 재생 중입니다</span>
      </div>
      <p class="pocket-hint">💡 화면은 켜진 상태(배터리 사용 중)입니다. 화면을 두 번 연속 탭하거나 아래 [잠금 해제] 버튼을 누르면 원래 화면으로 복귀합니다.</p>
    </div>
    <div class="pocket-bottom">
      <button type="button" class="pocket-unlock-button" id="pocket-unlock-btn">
        <span class="pocket-unlock-icon">🔓</span>
        <span>잠금 해제</span>
      </button>
    </div>
  `;

  const exitMode = () => {
    exitPocketMode();
    if (typeof onUnlock === 'function') {
      try { onUnlock(); } catch {}
    }
  };

  // Double tap anywhere on black screen to unlock
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('#pocket-unlock-btn')) return;
    const now = Date.now();
    if (now - lastTapTime < 380) {
      exitMode();
    } else {
      lastTapTime = now;
      const hint = overlay.querySelector('.pocket-hint');
      if (hint) {
        hint.classList.add('highlight');
        setTimeout(() => hint.classList.remove('highlight'), 1200);
      }
    }
  });

  const unlockBtn = overlay.querySelector('#pocket-unlock-btn');
  if (unlockBtn) {
    const handleUnlock = (e) => {
      e.preventDefault();
      e.stopPropagation();
      exitMode();
    };
    unlockBtn.addEventListener('click', handleUnlock);
    unlockBtn.addEventListener('touchend', handleUnlock, { passive: false });
  }

  // Prevent default context menu or unwanted selections
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());

  document.body.appendChild(overlay);
  document.body.classList.add('in-pocket-mode');
  currentPocketOverlay = overlay;

  return overlay;
}

/**
 * Exit Pocket Mode.
 */
export function exitPocketMode() {
  if (currentPocketOverlay && currentPocketOverlay.parentNode) {
    currentPocketOverlay.parentNode.removeChild(currentPocketOverlay);
  }
  currentPocketOverlay = null;
  if (typeof document !== 'undefined') {
    document.body.classList.remove('in-pocket-mode');
  }
}

export function isPocketModeActive() {
  return Boolean(currentPocketOverlay);
}

/**
 * Request native Picture-in-Picture for HTML5 video elements.
 */
export async function requestPictureInPicture(videoEl) {
  if (!videoEl) return false;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return false;
    } else if (videoEl.requestPictureInPicture) {
      await videoEl.requestPictureInPicture();
      return true;
    } else if (videoEl.webkitSetPresentationMode) {
      videoEl.webkitSetPresentationMode('picture-in-picture');
      return true;
    }
  } catch (err) {
    console.warn('[AcaRaca] PiP request error:', err);
    return false;
  }
  return false;
}
