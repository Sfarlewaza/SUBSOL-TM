export function computeDHash(
  source: HTMLImageElement | HTMLVideoElement,
  cropCenter = false
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 9;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sw || !sh) return "";

  if (cropCenter) {
    // Sample central 70% matching the dashed red reticle
    const cw = sw * 0.7;
    const ch = sh * 0.7;
    const sx = (sw - cw) / 2;
    const sy = (sh - ch) / 2;
    ctx.drawImage(source, sx, sy, cw, ch, 0, 0, 9, 8);
  } else {
    ctx.drawImage(source, 0, 0, 9, 8);
  }

  const { data } = ctx.getImageData(0, 0, 9, 8);
  let hash = "";

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idxLeft = (y * 9 + x) * 4;
      const idxRight = (y * 9 + (x + 1)) * 4;
      const grayLeft =
        0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2];
      const grayRight =
        0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];
      hash += grayLeft > grayRight ? "1" : "0";
    }
  }
  return hash;
}

export function hammingDistance(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) diff++;
  }
  return diff;
}
