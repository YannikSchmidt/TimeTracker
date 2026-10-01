import { BarcodeFormat, EncodeHintType, QRCodeWriter } from '@zxing/library';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

/** QR-Code als SVG (schwarz auf weiß, mit Ruhezone – auch im dunklen Design gut scanbar). */
export function QrCode({ value, size = 260 }: { value: string; size?: number }) {
  const { path, n } = useMemo(() => {
    const hints = new Map<EncodeHintType, unknown>([[EncodeHintType.ERROR_CORRECTION, 'L']]);
    const m = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 0, 0, hints);
    const width = m.getWidth();
    let d = '';
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) if (m.get(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { path: d, n: width + 8 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} accessibilityLabel="QR-Code der Einladung">
      <Rect x={0} y={0} width={n} height={n} fill="#fff" />
      <Path d={path} fill="#000" />
    </Svg>
  );
}
