export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (['checked', 'selected', 'disabled', 'hidden', 'value'].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  children.flat(Infinity).forEach(child => {
    if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

const paths = {
  home: ['M3 10 12 3l9 7', 'M5 9v12h5v-7h4v7h5V9'],
  library: ['M4 4h4v16H4z', 'M11 4h4v16h-4z', 'm18 4 4 15'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'],
  clock: ['M12 8v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'm9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3Z'],
  search: ['M21 21l-5-5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  play: ['m9 5 12 7-12 7Z'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  back: ['M19 12H5', 'm11 6-6 6 6 6'],
  share: ['M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'm8.5 10.5 7-4', 'm8.5 13.5 7 4'],
  mic: ['M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0Z', 'M5 10v2a7 7 0 0 0 14 0v-2', 'M12 19v3', 'M8 22h8'],
  shuffle: ['M3 6h3c5 0 7 12 12 12h3', 'm18 15 3 3-3 3', 'M3 18h3c2 0 3-2 4-4', 'M14 9c1-2 2-3 4-3h3', 'm18 3 3 3-3 3'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1'],
  check: ['m5 12 4 4L19 6'],
  external: ['M15 3h6v6', 'm21 3-9 9', 'M10 3H3v18h18v-7'],
  close: ['m6 6 12 12', 'm18 6-12 12'],
  qr: ['M3 3h6v6H3z', 'M15 3h6v6h-6z', 'M3 15h6v6H3z', 'M15 15h2v2h-2z', 'M19 15h2v2h-2z', 'M15 19h2v2h-2z', 'M19 19h2v2h-2z'],
  music: ['M9 18V5l12-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  rewind: ['m11 19-9-7 9-7v14z', 'm22 19-9-7 9-7v14z'],
  fastforward: ['m13 5 9 7-9 7V5z', 'm2 5 9 7-9 7V5z'],
  pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  stage: ['m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
  notes: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  document: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  image: ['M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'm21 15-5-5L5 21'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  sparkles: ['m12 3 1.912 5.885L20 10.8l-5.044 3.664L16.868 21 12 17.472 7.132 21l1.912-6.536L4 10.8l6.088-1.915L12 3z'],
  audio: ['M11 5 6 9H2v6h4l5 4V5z', 'M19.07 4.93a10 10 0 0 1 0 14.14', 'M15.54 8.46a5 5 0 0 1 0 7.07'],
  chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  academic: ['M22 10v6M2 10l10-5 10 5-10 5z', 'M6 12v5c3 3 9 3 12 0v-5'],
  presentation: ['M2 3h20v14H2z', 'M8 21h8', 'M12 17v4', 'M7 8h5', 'M7 12h8'],
  video: ['m23 7-7 5 7 5V7z', 'M1 5h15v14H1z'],
  book: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z']
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'icon', 'aria-hidden': 'true'})) svg.setAttribute(key, value);
  for (const d of paths[name] || paths.play) {
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}

export function button(label, onClick, className = 'button secondary', iconName = null, attributes = {}) {
  return el('button', {type: 'button', class: className, onclick: onClick, ...attributes}, iconName && icon(iconName), label);
}

let toastTimeout;
export function toast(message) {
  const node = document.getElementById('toast'); node.textContent = message; node.hidden = false;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { node.hidden = true; }, 4500);
}

export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, new URL('../', import.meta.url));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function cover(song, className = 'song-cover') {
  const fallback = new URL('../assets/images/fallback.svg', import.meta.url).href;
  const image = el('img', {class: className, src: safeImageUrl(song.thumbnail) || fallback, alt: `${song.title} 커버`, loading: 'lazy', decoding: 'async', width: '600', height: '600'});
  image.addEventListener('error', () => { if (image.src !== fallback) image.src = fallback; }, {once: true});
  return image;
}

export function emptyState(title, description, action = null) {
  return el('div', {class: 'empty-state'}, icon('library'), el('h3', {text: title}), el('p', {text: description}), action);
}
