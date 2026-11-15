export interface DHashResult {
  bits: string;
  contrastStdDev: number;
}

/**
 * Extracts a square sub-window (cropScale + offsetX/Y) from an already 1:1 square canvas
 * onto a 17x17 luma grid for 256-bit dual-axis dHash.
 */
function computeGridFromSquareCanvas(
  squareCanvas: HTMLCanvasElement,
  cropScale = 1,
  offsetX = 0,
  offsetY = 0
): DHashResult {
  const W = 17;
  const H = 17;
  const grid = document.createElement('canvas');
  grid.width = W;
  grid.height = H;
  const ctx = grid.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { bits: '', contrastStdDev: 0 };

  const size = squareCanvas.width;
  const sub = size * cropScale;
  const maxShift = (size - sub) / 2;
  const sx = Math.max(0, Math.min(size - sub, (size - sub) / 2 + offsetX * maxShift));
  const sy = Math.max(0, Math.min(size - sub, (size - sub) / 2 + offsetY * maxShift));

  ctx.drawImage(squareCanvas, sx, sy, sub, sub, 0, 0, W, H);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, W, H).data;
  } catch {
    return { bits: '', contrastStdDev: 0 };
  }

  const luma = new Float32Array(W * H);
  let sum = 0;
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    const g = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
    luma[i] = g;
    sum += g;
  }

  const mean = sum / (W * H);
  let sqDiff = 0;
  for (let i = 0; i < W * H; i++) {
    const d = luma[i] - mean;
    sqDiff += d * d;
  }
  const contrastStdDev = Math.sqrt(sqDiff / (W * H));

  // 128 horizontal gradient bits + 128 vertical gradient bits = 256 bits
  let bits = '';
  for (let y = 0; y < 8; y++) {
    const row = y * 2;
    for (let x = 0; x < 16; x++) {
      bits += luma[row * W + x] > luma[row * W + x + 1] ? '1' : '0';
    }
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const col = x * 2;
      bits += luma[y * W + col] > luma[(y + 1) * W + col] ? '1' : '0';
    }
  }

  return { bits, contrastStdDev };
}

/**
 * Center-crops any image/canvas to an exact 1:1 square (no black letterbox bars)
 * so reference photos and live 1:1 viewfinders share identical full-bleed geometry.
 */
async function sourceToSquareCanvas(
  source: File | HTMLCanvasElement | string,
  size = 160
): Promise<HTMLCanvasElement | null> {
  const sq = document.createElement('canvas');
  sq.width = size;
  sq.height = size;
  const ctx = sq.getContext('2d');
  if (!ctx) return null;

  if (source instanceof HTMLCanvasElement) {
    const side = Math.min(source.width, source.height);
    const sx = (source.width - side) / 2;
    const sy = (source.height - side) / 2;
    ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
    return sq;
  }

  const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = objectUrl;
    });
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;

    const side = Math.min(iw, ih);
    const sx = (iw - side) / 2;
    const sy = (ih - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return sq;
  } catch {
    return null;
  } finally {
    if (typeof source !== 'string') {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Center-crops an uploaded image File to an exact 1:1 square JPEG Data URL
 * for storage and display in Scan Nodes and Admin Calibration Targets.
 */
export async function cropFileToSquareDataUrl(
  file: File,
  targetSize = 360,
  quality = 0.78
): Promise<{ dataUrl: string; wasCropped: boolean }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = objectUrl;
    });
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const wasCropped = Math.abs(iw - ih) > 2;
    const side = Math.min(iw, ih);
    const sx = Math.max(0, (iw - side) / 2);
    const sy = Math.max(0, (ih - side) / 2);
    const outSize = Math.min(targetSize, side);

    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: '', wasCropped };

    ctx.drawImage(img, sx, sy, side, side, 0, 0, outSize, outSize);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      wasCropped,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function computeDetailedDHash(
  source: File | HTMLCanvasElement | string
): Promise<DHashResult> {
  const sq = await sourceToSquareCanvas(source, 160);
  if (!sq) return { bits: '', contrastStdDev: 0 };
  return computeGridFromSquareCanvas(sq, 1, 0, 0);
}

/**
 * Generates a bank of 256-bit hashes from the center-cropped 1:1 square reference
 * (full 1:1 + slight pan/zoom variants) for reliable handheld optical matching.
 */
export async function computeReferenceHashBank(src: string): Promise<string[]> {
  const sq = await sourceToSquareCanvas(src, 160);
  if (!sq) return [];
  const variants: Array<[number, number, number]> = [
    [1.0, 0, 0],
    [0.9, 0, 0],
    [0.9, -0.8, 0],
    [0.9, 0.8, 0],
    [0.9, 0, -0.8],
    [0.9, 0, 0.8],
  ];
  const hashes: string[] = [];
  for (const [scale, ox, oy] of variants) {
    const res = computeGridFromSquareCanvas(sq, scale, ox, oy);
    if (res.bits.length === 256) hashes.push(res.bits);
  }
  return hashes;
}

export async function computeFastDHash(
  source: File | HTMLCanvasElement | string
): Promise<string> {
  const res = await computeDetailedDHash(source);
  return res.bits;
}

export function hammingDistance(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== hashB.length) {
    return Math.max(hashA?.length || 256, hashB?.length || 256);
  }
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) dist++;
  }
  return dist;
}

export function minBankHammingDistance(bank: string[], liveBits: string): number {
  if (!bank.length || liveBits.length !== 256) return 256;
  let best = 256;
  for (const refBits of bank) {
    const d = hammingDistance(refBits, liveBits);
    if (d < best) best = d;
  }
  return best;
}

export function getScaledMaxDistance(base64Threshold: number, hashLength: number): number {
  const clampedBase = Math.max(14, Math.min(23, base64Threshold || 21));
  return Math.round((clampedBase / 64) * hashLength);
}

export interface ScannerSandboxConfig {
  enabled: boolean;
  usePublicRefs: boolean;
  awardPointsInLiveDemo: boolean;
  maxHammingDistance: number;
  refImageDataUrl: string;
  refLabel: string;
}

const SANDBOX_KEY = 'frecventa77_scanner_sandbox_v1';

export function loadScannerSandbox(): ScannerSandboxConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(SANDBOX_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        enabled: Boolean(raw.enabled),
        usePublicRefs: Boolean(raw.usePublicRefs),
        awardPointsInLiveDemo: raw.awardPointsInLiveDemo !== false,
        maxHammingDistance: Math.min(23, Math.max(18, Number(raw.maxHammingDistance) || 21)),
        refImageDataUrl: String(raw.refImageDataUrl || ''),
        refLabel: String(raw.refLabel || 'CUSTOM ADMIN TEST TAG'),
      };
    }
  } catch {
    // ignore
  }
  return {
    enabled: false,
    usePublicRefs: false,
    awardPointsInLiveDemo: true,
    maxHammingDistance: 21,
    refImageDataUrl: '',
    refLabel: 'CUSTOM ADMIN TEST TAG',
  };
}

export function saveScannerSandbox(cfg: ScannerSandboxConfig): void {
  localStorage.setItem(SANDBOX_KEY, JSON.stringify(cfg));
}
