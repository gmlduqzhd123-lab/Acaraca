// QR 코드를 기기 안에서 직접 만든다 (인터넷이 없어도 동작하고, 공유 주소가 외부 서비스로 나가지 않는다).
// 실제 인코딩은 index.html에서 불러오는 js/vendor/qrcode-generator-1.4.4.js(MIT, 전역 qrcode)가 맡는다.

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
