import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

/** QR-/Barcode-Erkennung im Browser: native BarcodeDetector-API, sonst zxing. */
const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
];

type Source = ImageBitmap | HTMLCanvasElement | HTMLVideoElement;
type Detector = { detect(src: Source): Promise<{ rawValue: string }[]> };

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

async function detectNative(source: Source): Promise<string | null> {
  const d = nativeDetector();
  if (!d) return null;
  try {
    const found = await d.detect(source);
    return found[0]?.rawValue || null;
  } catch {
    return null;
  }
}

/** Liest einen Code aus einem Foto. */
export async function decodeImage(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const native = await detectNative(bitmap);
    if (native) return native;
    for (const maxSide of [1600, 900, 2400]) {
      const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, maxSide);
      const code = canvas && decodeCanvas(canvas);
      if (code) return code;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** Liest einen Code aus dem aktuellen Bild eines laufenden Videos (Live-Scanner). */
export async function decodeVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<string | null> {
  if (!video.videoWidth) return null;
  const native = await detectNative(video);
  if (native) return native;
  // Mittleren Bereich vergrößert auswerten – dort hält man den Code hin
  const side = Math.min(video.videoWidth, video.videoHeight);
  const size = Math.min(900, side);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
  return decodeCanvas(canvas);
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

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
  [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
]);

function decodeCanvas(canvas: HTMLCanvasElement): string | null {
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
    return new MultiFormatReader().decode(bitmap, hints).getText();
  } catch {
    return null;
  }
}
