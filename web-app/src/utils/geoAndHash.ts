const W = 9;
const H = 8;

function extractNormalizedPatch(
  source: HTMLImageElement | HTMLVideoElement,
  srcWidth: number,
  srcHeight: number,
  zoom = 1,
  offsetXRatio = 0,
  offsetYRatio = 0
): number[] {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Array(W * H).fill(0);

  const safeZoom = Math.max(1, Math.min(4, zoom));
  const targetAspect = 3 / 4;
  const sourceAspect = srcWidth / srcHeight;

  let baseW = srcWidth;
  let baseH = srcHeight;
  if (sourceAspect > targetAspect) {
    baseW = srcHeight * targetAspect;
  } else {
    baseH = srcWidth / targetAspect;
  }

  const cropW = baseW / safeZoom;
  const cropH = baseH / safeZoom;

  const maxShiftX = (srcWidth - cropW) / 2;
  const maxShiftY = (srcHeight - cropH) / 2;
  const cropX = Math.max(0, Math.min(srcWidth - cropW, (srcWidth - cropW) / 2 + offsetXRatio * maxShiftX));
  const cropY = Math.max(0, Math.min(srcHeight - cropH, (srcHeight - cropH) / 2 + offsetYRatio * maxShiftY));

  ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const gray: number[] = [];
  let minVal = 255;
  let maxVal = 0;

  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray.push(luma);
    if (luma < minVal) minVal = luma;
    if (luma > maxVal) maxVal = luma;
  }

  // Contrast normalization so blurry/zoomed camera frames match crisp reference photos
  const span = Math.max(1, maxVal - minVal);
  return gray.map((v) => ((v - minVal) / span) * 255);
}

function signatureFromPatch(norm: number[]): string {
  // 1. 64-bit dHash (horizontal gradients)
  let dBits = "";
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      dBits += norm[y * W + x] > norm[y * W + x + 1] ? "1" : "0";
    }
  }

  // 2. 64-bit aHash (bright vs dark mass — blur-resistant)
  const avg = norm.reduce((acc, v) => acc + v, 0) / norm.length;
  let aBits = "";
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      aBits += norm[y * W + x] > avg ? "1" : "0";
    }
  }

  return dBits + aBits; // 128-bit combined signature
}

export async function hashImageUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const patch = extractNormalizedPatch(
        img,
        img.naturalWidth || 300,
        img.naturalHeight || 400,
        1,
        0,
        0
      );
      resolve(signatureFromPatch(patch));
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

/**
 * Returns 5 spatial-jitter signatures (center + 4 slight shifts) so handheld
 * framing offsets and zoomed-in lower-res crops still match reliably.
 */
export function hashVideoFrameCandidates(video: HTMLVideoElement, zoom = 1): string[] {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return [];
  }

  const offsets: [number, number][] = [
    [0, 0],
    [-0.12, 0],
    [0.12, 0],
    [0, -0.12],
    [0, 0.12],
  ];

  return offsets.map(([ox, oy]) => {
    const patch = extractNormalizedPatch(video, video.videoWidth, video.videoHeight, zoom, ox, oy);
    return signatureFromPatch(patch);
  });
}

export function hammingDistance(hashA: string, hashB: string): number {
  const len = Math.min(hashA.length, hashB.length);
  let diff = 0;
  for (let i = 0; i < len; i++) {
    if (hashA[i] !== hashB[i]) diff++;
  }
  return diff;
}

export async function compressImageFile(file: File, maxWidth = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
