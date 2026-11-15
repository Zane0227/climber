const RESOLUTION_TIERS = [
  { label: "4K", shortEdge: 2160, bitrate: 20_000_000 },
  { label: "1440p", shortEdge: 1440, bitrate: 12_000_000 },
  { label: "1080p", shortEdge: 1080, bitrate: 8_000_000 },
  { label: "720p", shortEdge: 720, bitrate: 5_000_000 },
  { label: "540p", shortEdge: 540, bitrate: 3_000_000 },
];

export function getResolutionOptions(width: number, height: number) {
  const shortEdge = Math.min(width, height);
  const options = RESOLUTION_TIERS.filter((option) => option.shortEdge <= shortEdge);
  if (options.length) return options;
  return [{ label: "源尺寸", shortEdge, bitrate: 2_000_000 }];
}

export function computeExportDimensions(
  sourceWidth: number,
  sourceHeight: number,
  shortEdge: number,
): { width: number; height: number } {
  const ar = sourceWidth / sourceHeight;
  let w: number, h: number;
  if (ar >= 1) {
    // 横版或正方形：短边是高度
    h = shortEdge;
    w = Math.round(h * ar);
  } else {
    // 竖版：短边是宽度
    w = shortEdge;
    h = Math.round(w / ar);
  }
  // 确保偶数（视频编码器要求）
  w = w % 2 === 0 ? w : w + 1;
  h = h % 2 === 0 ? h : h + 1;
  return { width: w, height: h };
}
