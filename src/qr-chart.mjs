/** @param {Array<{date:string,count:number}>} daily */
export function chartGeometry(daily) {
  const width = 760,
    height = 260;
  const left = 54,
    right = 22,
    top = 22,
    bottom = 40;
  const peak = Math.max(0, ...daily.map((day) => day.count));
  const step = Math.max(1, Math.ceil(peak / 4));
  const maximum = step * 4;
  const points = daily.map((day, index) => ({
    ...day,
    x: left + (index * (width - left - right)) / Math.max(1, daily.length - 1),
    y: top + (1 - day.count / maximum) * (height - top - bottom),
  }));
  const ticks = Array.from({ length: 5 }, (_, i) => ({
    value: i * step,
    y: top + (1 - i / 4) * (height - top - bottom),
  }));
  const labelIndexes = [
    ...new Set([0, Math.floor((daily.length - 1) / 2), daily.length - 1]),
  ].filter((i) => i >= 0);
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    maximum,
    points,
    ticks,
    labelIndexes,
    polyline: points.map((p) => `${p.x},${p.y}`).join(" "),
  };
}
