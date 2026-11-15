"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatTime, type TrimRange } from "@/lib/editor-time";
import { useFilmstrip } from "@/hooks/useFilmstrip";
import Icon from "./Icon";

interface TimelineProps {
  source: string;
  duration: number;
  time: number;
  trim: TrimRange;
  disabled: boolean;
  onSeek: (time: number) => void;
  onTrim: (edge: keyof TrimRange, time: number) => void;
  onReset: () => void;
  onPlaySelection: () => void;
}

export default function Timeline({
  source, duration, time, trim, disabled, onSeek, onTrim, onReset, onPlaySelection,
}: TimelineProps) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ edge: keyof TrimRange; pointerId: number; offset: number } | null>(null);
  const filmstrip = useFilmstrip(source, duration);
  const percentage = (value: number) => duration ? 100 * value / duration : 0;
  const isTrimmed = trim.start > 0 || trim.end < duration;

  function startDrag(event: PointerEvent<HTMLButtonElement>, edge: keyof TrimRange) {
    if (event.button !== 0 || !event.isPrimary || !track.current) return;
    event.stopPropagation();
    const { left, width } = track.current.getBoundingClientRect();
    const offset = event.clientX - (left + width * trim[edge] / duration);
    drag.current = { edge, pointerId: event.pointerId, offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveBoundary(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId !== event.pointerId || !track.current) return;
    const { left, width } = track.current.getBoundingClientRect();
    if (!width) return;
    onTrim(drag.current.edge, (event.clientX - left - drag.current.offset) * duration / width);
  }

  function keyBoundary(event: KeyboardEvent<HTMLButtonElement>, edge: keyof TrimRange) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 1 : 0.1;
    onTrim(edge, trim[edge] + (event.key === "ArrowLeft" ? -step : step));
  }

  return (
    <section className="timeline" aria-labelledby="timeline-title">
      <div className="section-heading">
        <h2 id="timeline-title"><Icon name="trim" /> 裁切区间</h2>
        <span className="mono muted">{formatTime(trim.end - trim.start, 1)} 选区</span>
      </div>
      <div className="timeline-ruler mono" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((point) => <span key={point}>{formatTime(point * duration)}</span>)}
      </div>
      <div className="timeline-track" ref={track}>
        <div className="filmstrip" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} style={filmstrip[index] ? { backgroundImage: `url(${filmstrip[index]})` } : undefined} />
          ))}
        </div>
        <div className="timeline-shade" style={{ width: `${percentage(trim.start)}%` }} />
        <div className="timeline-shade timeline-shade-end" style={{ width: `${100 - percentage(trim.end)}%` }} />
        <div className="timeline-selection" style={{
          left: `${percentage(trim.start)}%`, right: `${100 - percentage(trim.end)}%`,
        }} />
        <div className="timeline-cursor" style={{ left: `${percentage(time)}%` }} />
        <input className="timeline-scrubber" type="range" min={0} max={duration || 1} step="any"
          value={time} disabled={disabled || !duration} aria-label="播放位置" aria-valuetext={formatTime(time, 2)}
          onChange={(event) => onSeek(event.currentTarget.valueAsNumber)} />
        {(["start", "end"] as const).map((edge) => (
          <button key={edge} type="button" className={`trim-handle trim-handle-${edge}`}
            style={{ left: `${percentage(trim[edge])}%` }} aria-label={edge === "start" ? "拖动起点" : "拖动终点"}
            title={`${edge === "start" ? "选区起点" : "选区终点"} ${formatTime(trim[edge], 2)}`}
            disabled={disabled || !duration} onPointerDown={(event) => startDrag(event, edge)}
            onPointerMove={moveBoundary} onLostPointerCapture={() => { drag.current = null; }}
            onKeyDown={(event) => keyBoundary(event, edge)}>
            <span aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="timeline-controls">
        <BoundaryField name="起点" value={trim.start} onChange={(value) => onTrim("start", value)}
          disabled={disabled} duration={duration} />
        <button type="button" className="button button-quiet set-boundary" onClick={() => onTrim("start", time)}
          disabled={disabled || time >= trim.end} title="用当前播放位置设置起点">
          <Icon name="left" /> 设起点
        </button>
        <BoundaryField name="终点" value={trim.end} onChange={(value) => onTrim("end", value)}
          disabled={disabled} duration={duration} />
        <button type="button" className="button button-quiet set-boundary" onClick={() => onTrim("end", time)}
          disabled={disabled || time <= trim.start} title="用当前播放位置设置终点">
          <Icon name="right" /> 设终点
        </button>
        <div className="selection-actions">
          <button type="button" className="button button-quiet reset-trim" onClick={onReset} disabled={disabled || !isTrimmed}>整段</button>
          <button type="button" className="button" onClick={onPlaySelection} disabled={disabled}><Icon name="play" /> 播放选区</button>
        </div>
      </div>
    </section>
  );
}

function BoundaryField({ name, value, duration, disabled, onChange }: {
  name: string;
  value: number;
  duration: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancel = useRef(false);

  return (
    <label className="boundary-field">
      <span>{name}</span>
      <input type="number" className="mono" step="0.01" min={0} max={duration} inputMode="decimal" disabled={disabled}
        value={draft ?? value.toFixed(2)} onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={(event) => {
          if (!cancel.current && draft !== null) onChange(event.currentTarget.valueAsNumber);
          cancel.current = false;
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            cancel.current = true;
            event.currentTarget.blur();
          } else if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }} />
      <span>秒</span>
    </label>
  );
}
