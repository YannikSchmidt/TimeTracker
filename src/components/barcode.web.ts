import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

/** Was gescannt werden soll: Strichcodes (Aufträge, Artikel) oder QR-Codes (Einladungen). */
export type ScanKind = 'barcode' | 'qr';

/** Barcode-/QR-Erkennung im Browser: native BarcodeDetector-API, sonst zxing. */
const BARCODE_FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];
const QR_FORMATS = [BarcodeFormat.QR_CODE];

/** Formatnamen der BarcodeDetector-API je Art */
const NATIVE_FORMATS: Record<ScanKind, Set<string>> = {
  barcode: new Set(['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar']),
  qr: new Set(['qr_code']),
};

type Source = ImageBitmap | HTMLCanvasElement | HTMLVideoElement;
type Detector = { detect(src: Source): Promise<{ rawValue: string; format?: string }[]> };

let detector: Detector | null | undefined;

/** Native Erkennung des Browsers (z.B. Chrome auf Android), falls vorhanden. */
function nativeDetector(): Detector | null {
  if (detector === undefined) {
    const Ctor = (globalThis as { BarcodeDetector?: new () => Detector }).BarcodeDetector;
    try {
      detector = Ctor ? new Ctor() : null;
    } catch {
      detector = null;
    }
  }
  return detector;
}

async function detectNative(source: Source, kind: ScanKind): Promise<string | null> {
  const d = nativeDetector();
  if (!d) return null;
  try {
    const found = await d.detect(source);
    return found.find((f) => !f.format || NATIVE_FORMATS[kind].has(f.format))?.rawValue || null;
  } catch {
    return null;
  }
}

/** Liest einen Code aus einem Foto. */
export async function decodeImage(file: File, kind: ScanKind = 'barcode'): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const native = await detectNative(bitmap, kind);
    if (native) return native;
    for (const maxSide of [1600, 900, 2400]) {
      const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, maxSide);
      const code = canvas && decodeCanvas(canvas, kind);
      if (code) return code;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** Liest einen Code aus dem aktuellen Bild eines laufenden Videos (Live-Scanner). */
export async function decodeVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, kind: ScanKind = 'barcode'): Promise<string | null> {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!vw) return null;
  const native = await detectNative(video, kind);
  if (native) return native;
  // Mittleren Bereich auswerten – dort hält man den Code hin (Strichcode: breiter Streifen, QR: Quadrat)
  const side = Math.min(vw, vh);
  const [sw, sh] = kind === 'barcode' ? [vw, Math.round(side * 0.5)] : [side, side];
  const scale = Math.min(1, 900 / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return decodeCanvas(canvas, kind);
}

function drawScaled(img: CanvasImageSource, w: number, h: number, maxSide: number): HTMLCanvasElement | null {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const HINTS: Record<ScanKind, Map<DecodeHintType, unknown>> = {
  barcode: new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS],
  ]),
  qr: new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, QR_FORMATS],
  ]),
};

function decodeCanvas(canvas: HTMLCanvasElement, kind: ScanKind): string | null {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !width || !height) return null;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  }
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height)));
    return new MultiFormatReader().decode(bitmap, HINTS[kind]).getText();
  } catch {
    return null;
  }
}
