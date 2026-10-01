import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';

/** Liest einen QR-/Barcode aus einem Foto (nur Browser). */
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

export async function decodeImage(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    // Native Erkennung des Browsers, falls vorhanden (z.B. Chrome auf Android)
    const Detector = (globalThis as { BarcodeDetector?: new () => { detect(src: ImageBitmap): Promise<{ rawValue: string }[]> } })
      .BarcodeDetector;
    if (Detector) {
      try {
        const found = await new Detector().detect(bitmap);
        if (found[0]?.rawValue) return found[0].rawValue;
      } catch {
        // weiter mit zxing
      }
    }
    for (const maxSide of [1600, 900, 2400]) {
      const code = decodeWithZxing(bitmap, maxSide);
      if (code) return code;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

function decodeWithZxing(bitmap: ImageBitmap, maxSide: number): string | null {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  }
  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
  ]);
  try {
    const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height))), hints);
    return result.getText();
  } catch {
    return null;
  }
}

