export async function computeFastDHash(source: File | string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';

  if (typeof source !== 'string' && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source, {
      resizeWidth: 16,
      resizeHeight: 16,
      resizeQuality: 'low',
    });
    ctx.drawImage(bitmap, 0, 0, 9, 8);
    bitmap.close();
  } else {
    const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objectUrl;
      });
      ctx.drawImage(img, 0, 0, 9, 8);
    } finally {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  const data = ctx.getImageData(0, 0, 9, 8).data;
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx1 = (y * 9 + x) * 4;
      const idx2 = (y * 9 + x + 1) * 4;
      const g1 = data[idx1] * 0.3 + data[idx1 + 1] * 0.59 + data[idx1 + 2] * 0.11;
      const g2 = data[idx2] * 0.3 + data[idx2 + 1] * 0.59 + data[idx2 + 2] * 0.11;
      bits += g1 > g2 ? '1' : '0';
    }
  }
  return bits;
}

export function hammingDistance(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) dist++;
  }
  return dist;
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
        maxHammingDistance: Number(raw.maxHammingDistance) || 24,
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
    maxHammingDistance: 24,
    refImageDataUrl: '',
    refLabel: 'CUSTOM ADMIN TEST TAG',
  };
}

export function saveScannerSandbox(cfg: ScannerSandboxConfig): void {
  localStorage.setItem(SANDBOX_KEY, JSON.stringify(cfg));
}
