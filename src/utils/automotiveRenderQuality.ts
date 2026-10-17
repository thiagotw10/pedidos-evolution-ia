/** Keep small high-density screens crisp without allocating an unbounded framebuffer. */
export function automotivePixelRatio(width: number, height: number, deviceRatio: number, maxDimension = 8192): number {
  const w = Math.max(1, Number.isFinite(width) ? width : 1);
  const h = Math.max(1, Number.isFinite(height) ? height : 1);
  const density = Number.isFinite(deviceRatio) ? deviceRatio : 1;
  const limit = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 8192;
  return Math.max(.25, Math.min(
    Math.max(1.5, density),
    2.5,
    Math.sqrt(4_000_000 / (w * h)),
    limit / w,
    limit / h,
  ));
}
