export interface TrimRange {
  start: number;
  end: number;
}

export function formatTime(seconds: number, precision = 0) {
  const factor = 10 ** precision;
  const units = Math.round(Math.max(0, seconds) * factor);
  const whole = Math.floor(units / factor);
  const minutes = Math.floor(whole / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  const fraction = precision ? `.${String(units % factor).padStart(precision, "0")}` : "";
  return `${minutes}:${remainder}${fraction}`;
}

export function limitTime(time: number, duration: number) {
  return Math.min(duration, Math.max(0, time));
}

export function setTrimBoundary(
  range: TrimRange,
  edge: keyof TrimRange,
  time: number,
  duration: number,
): TrimRange {
  const minLength = Math.min(0.25, duration);
  const bounded = limitTime(time, duration);
  return edge === "start"
    ? { start: Math.max(0, Math.min(bounded, range.end - minLength)), end: range.end }
    : { start: range.start, end: Math.min(duration, Math.max(bounded, range.start + minLength)) };
}
