// QR 코드를 기기 안에서 직접 만든다 (인터넷이 없어도 동작하고, 공유 주소가 외부 서비스로 나가지 않는다).
// 실제 인코딩은 js/vendor/qrcode-generator-1.4.4.js(MIT, 전역 qrcode)가 맡는다.
// 첫 화면을 빨리 띄우려고 이 라이브러리는 앱이 뜬 뒤 loadQrLibrary()로 받는다.

let qrLibraryPromise = null;
/** QR 라이브러리를 한 번만 불러온다 (이미 있으면 바로 끝). */
export function loadQrLibrary() {
  if (typeof globalThis.qrcode === 'function') return Promise.resolve(true);
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (!qrLibraryPromise) {
    qrLibraryPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/qrcode-generator-1.4.4.js', import.meta.url).href;
      script.async = true;
      script.onload = () => resolve(typeof globalThis.qrcode === 'function');
      script.onerror = () => { qrLibraryPromise = null; script.remove(); resolve(false); };
      document.head.append(script);
    });
  }
  return qrLibraryPromise;
}

/**
 * text를 담은 QR 코드 SVG data URL을 돌려준다. 만들 수 없으면 null.
 * (라이브러리가 없거나, 내용이 QR 한 장에 담기에 너무 긴 경우)
 */
export function qrDataUrl(text, { errorCorrection = 'M', quietZone = 4 } = {}) {
  const qrcode = globalThis.qrcode;
  if (typeof qrcode !== 'function' || !text) return null;
  try {
    // 기본 인코딩은 한 글자를 1바이트로 잘라 한글이 깨지므로 UTF-8로 바꾼다.
    if (qrcode.stringToBytesFuncs?.['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, errorCorrection); // 0 = 내용 길이에 맞춰 크기 자동 선택
    qr.addData(String(text));
    qr.make();
    const cellSize = 4;
    // 카메라 인식에 필요한 흰 여백(셀 4칸)을 둔다. 라이브러리의 margin 단위는 픽셀이다.
    const svg = qr.createSvgTag({ cellSize, margin: cellSize * quietZone, scalable: true });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}
