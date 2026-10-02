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
export function createPlayer(container, media, title = 'AcaRoom 연습 영상') {
  const parsed = parseYouTube(media);
  const shell = document.createElement('div');
  shell.className = 'player-shell';
  const screen = document.createElement('div');
  screen.className = 'player-screen';
  shell.append(screen);
  let destroyed = false;

  function mountFrame() {
    if (!parsed.ok || destroyed) return;
    const iframe = document.createElement('iframe');
    const embed = new URL(parsed.embedUrl);
    embed.searchParams.set('autoplay', '1');
    embed.searchParams.set('rel', '0');
    embed.searchParams.set('start', '0');
    iframe.src = embed.href;
    iframe.className = 'player-frame';
    iframe.title = title;
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    screen.replaceChildren(iframe);
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
    play.addEventListener('click', mountFrame);
    screen.append(play);
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
    restart: mountFrame,
    destroy() {
      destroyed = true;
      shell.remove();
    },
  };
}
