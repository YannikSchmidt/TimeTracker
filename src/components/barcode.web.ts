import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

/**
 * Was gescannt werden soll: Codes auf den Auftragspapieren (Auftrag als Strichcode Code 39, Artikel als
 * Data-Matrix-Quadrat; Code 128 als Reserve) oder QR-Codes (Einladungen).
 */
export type ScanKind = 'barcode' | 'qr';

/**
 * Nur die Formate, die auf den Papieren vorkommen. Weitere Formate (ITF, Codabar, EAN …) lesen aus einem
 * halb erfassten Code-39-Strichcode gern eine kürzere oder falsche Nummer heraus – deshalb bewusst nicht dabei.
 */
const BARCODE_FORMATS = [BarcodeFormat.CODE_39, BarcodeFormat.CODE_128, BarcodeFormat.DATA_MATRIX];
const QR_FORMATS = [BarcodeFormat.QR_CODE];

/** Formatnamen der BarcodeDetector-API je Art */
const NATIVE_FORMATS: Record<ScanKind, string[]> = {
  barcode: ['code_39', 'code_128', 'data_matrix'],
  qr: ['qr_code'],
};

type Source = ImageBitmap | HTMLCanvasElement | HTMLVideoElement;
type Detector = { detect(src: Source): Promise<{ rawValue: string; format?: string }[]> };

const detectors = new Map<ScanKind, Detector | null>();

/** Native Erkennung des Browsers (z.B. Chrome auf Android), falls vorhanden – nur mit den benötigten Formaten. */
function nativeDetector(kind: ScanKind): Detector | null {
  if (!detectors.has(kind)) {
    const Ctor = (globalThis as { BarcodeDetector?: new (opts?: { formats: string[] }) => Detector }).BarcodeDetector;
    let d: Detector | null = null;
    try {
      d = Ctor ? new Ctor({ formats: NATIVE_FORMATS[kind] }) : null;
    } catch {
      try {
        d = Ctor ? new Ctor() : null; // ältere Umsetzung ohne Formatliste – Ergebnisse werden unten gefiltert
      } catch {
        d = null;
      }
    }
    detectors.set(kind, d);
  }
  return detectors.get(kind) ?? null;
}

async function detectNative(source: Source, kind: ScanKind): Promise<string[] | null> {
  const d = nativeDetector(kind);
  if (!d) return null;
  try {
    const found = await d.detect(source);
    return found.filter((f) => !f.format || NATIVE_FORMATS[kind].includes(f.format)).map((f) => f.rawValue).filter(Boolean);
  } catch {
    return null;
  }
}

/** Liest die Codes aus einem Foto (native Erkennung: alle, sonst den ersten gefundenen). */
export async function decodeImage(file: File, kind: ScanKind = 'barcode'): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const native = await detectNative(bitmap, kind);
    if (native?.length) return native;
    for (const maxSide of [1600, 900, 2400]) {
      const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, maxSide);
      const code = canvas && decodeCanvas(canvas, kind);
      if (code) return [code];
    }
    return [];
  } finally {
    bitmap.close();
  }
}

/** Liest die Codes aus dem aktuellen Bild eines laufenden Videos (Live-Scanner). */
export async function decodeVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, kind: ScanKind = 'barcode'): Promise<string[]> {
  const { videoWidth: vw } = video;
  if (!vw) return [];
  const native = await detectNative(video, kind);
  if (native) return native;
  // Ohne native Erkennung (z.B. iPhone): genau den Bereich im weißen Rahmen auswerten – dorthin hält man den
  // Code – in zwei Größen, denn feine Strichcodes und große Data-Matrix-Quadrate brauchen unterschiedliche Auflösung.
  const r = frameRegion(video, kind);
  for (const width of [640, 420]) {
    const scale = Math.min(1, width / r.w);
    canvas.width = Math.round(r.w * scale);
    canvas.height = Math.round(r.h * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    const code = decodeCanvas(canvas, kind);
    if (code) return [code];
  }
  return [];
}

/**
 * Bereich des Videos, der im Rahmen der Vorschau zu sehen ist (Video füllt die Box per „cover“), plus Rand.
 * Strichcode-Rahmen: 88 % der Breite, Seitenverhältnis 2,4; QR-Rahmen: 65 % der Breite, quadratisch.
 */
function frameRegion(video: HTMLVideoElement, kind: ScanKind): { x: number; y: number; w: number; h: number } {
  const { videoWidth: vw, videoHeight: vh, clientWidth: cw, clientHeight: ch } = video;
  if (!cw || !ch) {
    const side = Math.min(vw, vh);
    const [w, h] = kind === 'barcode' ? [vw, Math.round(side * 0.6)] : [side, side];
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  }
  const scale = Math.max(cw / vw, ch / vh); // Bildschirm-Pixel je Video-Pixel
  const fw = (kind === 'barcode' ? 0.88 : 0.65) * cw;
  const fh = kind === 'barcode' ? fw / 2.4 : fw;
  const margin = 1.3;
  const w = Math.min(vw, Math.round((fw * margin) / scale));
  const h = Math.min(vh, Math.round((fh * margin) / scale));
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
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
