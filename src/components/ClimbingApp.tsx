"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { useClimbingEditor } from "@/hooks/useClimbingEditor";
import { formatTime } from "@/lib/editor-time";
import ControlPanel from "./ControlPanel";
import ExportPanel from "./ExportPanel";
import Icon from "./Icon";
import Timeline from "./Timeline";
import VideoTracker, { type PreviewMode } from "./VideoTracker";
import VideoUploader from "./VideoUploader";

const PREVIEW_OPTIONS = [
  { mode: "tracked", label: "跟踪" },
  { mode: "original", label: "原片" },
  { mode: "debug", label: "关键点" },
] as const;

export default function ClimbingApp() {
  const editor = useClimbingEditor();
  const [mode, setMode] = useState<PreviewMode>("tracked");
  const [muted, setMuted] = useState(false);
  const { source, meta, tracker, time, duration, playing, busy, trim, scan } = editor;
  const blocked = !!busy || !meta;
  const modelPending = tracker.modelState === "loading";
  const canAnalyze = tracker.isReady && !blocked;

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target;
    if (blocked || event.ctrlKey || event.metaKey || event.altKey ||
      (target instanceof HTMLElement && target.closest("input, select, textarea, button, a, summary, [contenteditable]"))) return;

    if (event.code === "Space") {
      event.preventDefault();
      void editor.play();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      editor.seek(time + (event.key === "ArrowLeft" ? -1 : 1));
    } else if (event.key === "[" || event.key === "【") {
      editor.changeTrim("start", time);
    } else if (event.key === "]" || event.key === "】") {
      editor.changeTrim("end", time);
    }
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => handleShortcut(event);
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  let trackingStatus: ReactNode;
  if (modelPending) trackingStatus = "正在加载跟踪模型…";
  else if (!tracker.isReady) trackingStatus = "跟踪模型加载失败";
  else if (tracker.person?.occluded) trackingStatus = "遮挡中 · 保持取景";
  else if (tracker.person) trackingStatus = playing ? "正在跟踪" : "已定位攀岩者";
  else trackingStatus = playing ? "正在寻找攀岩者" : "全景";

  return (
    <div className="editor-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="wordmark"><span className="brand-icon"><Icon name="mountain" /></span><span>攀岩剪辑</span></div>
          {source && <VideoUploader compact onFile={editor.loadSource} />}
        </div>
      </header>

      <main className={source ? "workspace" : "welcome"}>
        {!source ? (
          <>
            <div className="welcome-copy">
              <h1>攀岩视频剪辑</h1>
              <p>跟踪攀岩者，选择要保留的片段，导出 MP4。</p>
            </div>
            <VideoUploader onFile={editor.loadSource} />
            {editor.mediaError && <p className="inline-notice" role="alert">{editor.mediaError}</p>}
            <p className="privacy-note">视频在本机浏览器处理。</p>
          </>
        ) : (
          <>
            <section className="edit-panel" aria-labelledby="video-title"
              onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
              onDrop={(event) => {
                const file = event.dataTransfer.files[0];
                if (file) {
                  event.preventDefault();
                  editor.loadSource(file);
                }
              }}>
              <div className="preview-header">
                <div className="file-info">
                  <Icon name="film" />
                  <div>
                    <h1 id="video-title" title={source.name}>{source.name}</h1>
                    <p className="mono">{meta ? `${meta.width} × ${meta.height}  ·  ${meta.fps} fps` : "源视频"}</p>
                  </div>
                </div>
                <div className="segmented" aria-label="预览模式" role="group">
                  {PREVIEW_OPTIONS.map((option) => (
                    <button type="button" key={option.mode} aria-pressed={mode === option.mode}
                      onClick={() => setMode(option.mode)}>{option.label}</button>
                  ))}
                </div>
              </div>

              <VideoTracker key={source.url} source={source.url} mode={mode} muted={muted} busy={!!busy}
                mediaReady={!!meta} mediaError={editor.mediaError} viewport={tracker.viewport} person={tracker.person}
                onMetadata={editor.onMetadata} onPlay={editor.onPlay} onPause={editor.onPause}
                onError={editor.onMediaError} onSeeked={editor.onSeeked} onTimeUpdate={editor.onTimeUpdate} />

              <div className="transport">
                <div className="transport-buttons">
                  <button type="button" className="button icon-button" aria-label="后退 5 秒" title="后退 5 秒"
                    onClick={() => editor.seek(time - 5)} disabled={blocked}><Icon name="back" /></button>
                  <button type="button" className="button button-primary play-button" onClick={() => void editor.play()} disabled={blocked}>
                    <Icon name={playing ? "pause" : "play"} /> {playing ? "暂停" : "播放"}
                  </button>
                  <button type="button" className="button icon-button" aria-label="前进 5 秒" title="前进 5 秒"
                    onClick={() => editor.seek(time + 5)} disabled={blocked}><Icon name="forward" /></button>
                </div>
                <div className="play-time mono"><strong>{formatTime(time, 2)}</strong><span> / {formatTime(duration, 2)}</span></div>
                <button type="button" className="button button-quiet audio-toggle" aria-label="预览声音" aria-pressed={!muted}
                  onClick={() => setMuted(!muted)} disabled={!meta}>{muted ? "声音关" : "声音开"}</button>
              </div>

              {meta && (
                <div className="tracking-strip">
                  <div className="tracking-state"><i className={tracker.person && !tracker.person.occluded ? "state-active" : ""} />
                    {mode === "original" ? "正在预览原片" : trackingStatus}
                  </div>
                  {tracker.modelState === "error" && (
                    <button className="button button-quiet" type="button" onClick={tracker.retryModel}>重试模型</button>
                  )}
                  {editor.mediaError && <p className="inline-notice" role="alert">{editor.mediaError}</p>}
                </div>
              )}

              {meta && (
                <Timeline key={`timeline-${source.url}`} source={source.url} duration={duration} time={time} trim={trim}
                  disabled={!!busy} onSeek={editor.seek} onTrim={editor.changeTrim} onReset={editor.resetTrim}
                  onPlaySelection={() => void editor.play(true)} />
              )}
            </section>

            <aside className="inspector" aria-label="裁切与导出">
              <section className="inspector-panel auto-panel" aria-labelledby="scan-title">
                <div className="inspector-title"><Icon name="scan" /><h2 id="scan-title">上墙区间</h2></div>
                <div className="inspector-body">
                  {scan?.state === "running" ? (
                    <div className="job-progress">
                      <div><span>正在扫描原片</span><span className="mono">{Math.round(scan.progress * 100)}%</span></div>
                      <progress aria-label="扫描进度" value={scan.progress} max={1} />
                      <button className="button button-full" type="button" onClick={editor.cancelJob}>取消扫描</button>
                    </div>
                  ) : scan?.state === "suggestion" ? (
                    <>
                      <p role="status">建议保留 <strong className="mono">
                        {formatTime(scan.range.start, 1)} — {formatTime(scan.range.end, 1)}
                      </strong></p>
                      <div className="button-row">
                        <button className="button button-primary" type="button" onClick={editor.applySuggestion} disabled={!!busy}>应用选区</button>
                        <button className="button button-quiet" type="button" onClick={editor.dismissSuggestion}>忽略</button>
                      </div>
                    </>
                  ) : (
                    <>
                      {scan?.state === "empty" ? (
                        <p role="status">没有找到明确的上墙或下墙边界。当前选区已保留。</p>
                      ) : scan?.state === "error" ? (
                        <p className="inline-notice" role="alert">扫描失败。{scan.message}</p>
                      ) : (
                        <p>扫描原片，给出可应用的裁切建议。</p>
                      )}
                      <button className="button button-full" type="button" onClick={() => void editor.detectClimb()} disabled={!canAnalyze}>
                        <Icon name="scan" /> {scan ? "重新检测" : "自动检测"}
                      </button>
                    </>
                  )}
                </div>
              </section>
              {meta && (
                <ExportPanel key={source.url} meta={meta} audioStatus={editor.audioStatus} trim={trim} disabled={!canAnalyze}
                  running={busy === "export"} progress={editor.exportProgress} result={editor.exportResult} fileName={source.name}
                  onExport={(config, debug, keepAudio) => void editor.exportVideo(config, debug, keepAudio)} onCancel={editor.cancelJob} />
              )}
              <ControlPanel config={editor.config} disabled={!canAnalyze} onChange={editor.changeConfig} onReset={editor.resetConfig} />
            </aside>
          </>
        )}
      </main>
    </div>
  );
}
