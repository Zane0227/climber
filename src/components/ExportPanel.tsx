"use client";

import { useEffect, useState } from "react";
import type { ExportConfig, ExportProgress, VideoMeta } from "@/lib/video-exporter";
import type { AudioStatus } from "@/lib/export-audio";
import { computeExportDimensions, getResolutionOptions } from "@/lib/export-options";
import { formatTime, type TrimRange } from "@/lib/editor-time";
import Icon from "./Icon";

interface ExportPanelProps {
  meta: VideoMeta;
  audioStatus: AudioStatus;
  trim: TrimRange;
  disabled: boolean;
  running: boolean;
  progress: ExportProgress | null;
  result: { url: string; debug: boolean } | null;
  fileName: string;
  onExport: (config: ExportConfig, debug: boolean, keepAudio: boolean) => void;
  onCancel: () => void;
}

export default function ExportPanel({
  meta, audioStatus, trim, disabled, running, progress, result, fileName, onExport, onCancel,
}: ExportPanelProps) {
  const [edge, setEdge] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [debug, setDebug] = useState(false);
  const [keepAudio, setKeepAudio] = useState(true);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setSupported(typeof VideoEncoder === "function" && typeof VideoFrame === "function");
    const timer = window.setTimeout(check, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const presets = getResolutionOptions(meta.width, meta.height);
  const defaultPreset = presets.find((preset) => preset.shortEdge <= 1080) ?? presets[0];
  const preset = presets.find((preset) => preset.shortEdge === edge) ?? defaultPreset;
  const dimensions = computeExportDimensions(meta.width, meta.height, preset.shortEdge);
  const exportFps = fps ?? meta.fps;
  const includeAudio = keepAudio && audioStatus === "supported";
  const audioLabel = audioStatus === "loading" ? "读取音轨…"
    : audioStatus === "none" ? "源文件无音轨"
    : audioStatus === "unsupported" ? "当前音轨格式不支持导出"
    : includeAudio ? "保留原声" : "无声";
  const outputName = fileName.replace(/\.[^.]+$/, "") + (result?.debug ? "_debug.mp4" : "_tracked.mp4");

  return (
    <section className="inspector-panel export-panel" aria-labelledby="export-title">
      <div className="inspector-title"><Icon name="download" /><h2 id="export-title">导出视频</h2></div>
      <div className="inspector-body">
        <div className="export-range">
          <span>导出区间</span>
          <strong className="mono">{formatTime(trim.start, 1)} — {formatTime(trim.end, 1)}</strong>
        </div>
        <div className="export-fields">
          <label>清晰度
            <select value={preset.shortEdge} disabled={disabled || running}
              onChange={(event) => setEdge(Number(event.currentTarget.value))}>
              {presets.map((choice) => (
                <option key={choice.shortEdge} value={choice.shortEdge}>{choice.label}</option>
              ))}
            </select>
          </label>
          <label>帧率
            <select value={fps ?? "source"} disabled={disabled || running}
              onChange={(event) => setFps(event.currentTarget.value === "source" ? null : Number(event.currentTarget.value))}>
              <option value="source">源视频 · {meta.fps} fps</option>
              {[24, 25, 30, 50, 60].map((value) => <option key={value} value={value}>{value} fps</option>)}
            </select>
          </label>
        </div>
        <p className="export-format mono">
          {debug ? "跟踪与关键点并排" : `${dimensions.width} × ${dimensions.height}`} · MP4 · {audioLabel}
        </p>
        <details className="advanced-settings">
          <summary>导出选项 <Icon name="chevron" className="details-chevron" /></summary>
          {audioStatus === "supported" && (
            <label className="check-field">
              <input type="checkbox" checked={keepAudio} disabled={disabled || running}
                onChange={(event) => setKeepAudio(event.currentTarget.checked)} />
              保留原声
            </label>
          )}
          <label className="check-field">
            <input type="checkbox" checked={debug} disabled={disabled || running}
              onChange={(event) => setDebug(event.currentTarget.checked)} />
            加入原片与关键点对照
          </label>
        </details>

        {supported === false && <p className="inline-notice" role="alert">当前浏览器缺少 MP4 编码功能。可在支持 WebCodecs 的浏览器中导出。</p>}
        {progress?.phase === "error" && !running && (
          <p className="inline-notice" role="alert">导出失败。{progress.message}</p>
        )}
        {running ? (
          <div className="job-progress">
            <div><span>{progress?.message || "准备导出…"}</span><span className="mono">{Math.round((progress?.progress ?? 0) * 100)}%</span></div>
            <progress aria-label="导出进度" value={progress?.progress ?? 0} max={1} />
            <button type="button" className="button button-full" onClick={onCancel}>取消导出</button>
          </div>
        ) : (
          <button type="button" className={`button button-full ${result ? "" : "button-primary"}`}
            disabled={disabled || supported === false || audioStatus === "loading" || trim.end <= trim.start}
            onClick={() => onExport({ ...dimensions, fps: exportFps, videoBitrate: preset.bitrate }, debug, includeAudio)}>
            <Icon name="download" /> {result ? "重新导出" : "导出 MP4"}
          </button>
        )}
        {result && !running && (
          <div className="export-result">
            <p role="status"><Icon name="check" /> {result.debug ? "调试视频已就绪" : "视频已就绪"}</p>
            <a className="button button-primary button-full" href={result.url} download={outputName}>
              <Icon name="download" /> 下载视频
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
