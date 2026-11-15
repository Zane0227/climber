"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { limitTime, setTrimBoundary, type TrimRange } from "@/lib/editor-time";
import { estimateVideoFps, seekVideoFrame } from "@/lib/video-frames";
import { preferStereoInQuickTime } from "@/lib/quicktime-audio";
import type { AudioStatus, ExportAudio } from "@/lib/export-audio";
import { useTracker } from "@/hooks/useTracker";
import type { TrackerConfig } from "@/lib/tracker-types";
import type { ExportConfig, ExportProgress, VideoMeta } from "@/lib/video-exporter";
import type { ScanFrame } from "@/lib/climb-detector";

const DEFAULT_SETTINGS = {
  targetVerticalRatio: 0.6,
  smoothingFactor: 0.04,
  confidenceThreshold: 0.25,
  verticalCenterBias: 0.55,
  areaJumpThreshold: 2.5,
  dynoPadding: 1,
} satisfies Partial<TrackerConfig>;

type ScanResult =
  | { state: "running"; progress: number }
  | { state: "suggestion"; range: TrimRange }
  | { state: "empty" }
  | { state: "error"; message: string };

interface ExportResult {
  url: string;
  debug: boolean;
}

export function useClimbingEditor() {
  const [source, setSource] = useState<{ url: string; name: string; media: Blob } | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("loading");
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [trim, setTrim] = useState<TrimRange>({ start: 0, end: 0 });
  const [config, setConfig] = useState<Partial<TrackerConfig>>(DEFAULT_SETTINGS);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [busy, setBusy] = useState<"scan" | "export" | null>(null);
  const tracker = useTracker(DEFAULT_SETTINGS, source !== null);
  const { isReady, startTracking, stopTracking, resetTracking, previewFrame, processFrameRaw, updateConfig } = tracker;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const jobRef = useRef<AbortController | null>(null);
  const probeRef = useRef<AbortController | null>(null);
  const previewRef = useRef<AbortController | null>(null);
  const sourceAttemptRef = useRef(0);
  const stopAtRef = useRef<number | null>(null);

  const duration = meta?.duration ?? 0;
  const sourceUrl = source?.url;
  const exportUrl = exportResult?.url;

  useEffect(() => () => {
    sourceAttemptRef.current++;
    probeRef.current?.abort();
    previewRef.current?.abort();
    const job = jobRef.current;
    jobRef.current = null;
    job?.abort();
  }, []);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => () => {
    if (exportUrl) URL.revokeObjectURL(exportUrl);
  }, [exportUrl]);

  const loadSource = useCallback(async (file: File) => {
    const isVideo = file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|ogv|mkv)$/i.test(file.name);
    if (!isVideo || file.size === 0) {
      setMediaError("请选择可读的视频文件，例如 MP4、MOV 或 WebM。");
      return;
    }

    const attempt = ++sourceAttemptRef.current;
    const media = await preferStereoInQuickTime(file).catch(() => file);
    if (attempt !== sourceAttemptRef.current) return;

    jobRef.current?.abort();
    jobRef.current = null;
    probeRef.current?.abort();
    previewRef.current?.abort();
    stopAtRef.current = null;
    videoRef.current?.pause();
    videoRef.current = null;
    stopTracking();
    void resetTracking();
    setSource({ name: file.name, url: URL.createObjectURL(media), media });
    setAudioStatus("loading");
    setMeta(null);
    setMediaError(null);
    setPlaying(false);
    setTime(0);
    setTrim({ start: 0, end: 0 });
    setScan(null);
    setBusy(null);
    setExportProgress(null);
    setExportResult(null);
    void import("@/lib/export-audio").then(({ inspectExportAudio }) => inspectExportAudio(media))
      .catch(() => "unsupported" as const)
      .then((status) => {
        if (attempt === sourceAttemptRef.current) setAudioStatus(status);
      });
  }, [resetTracking, stopTracking]);

  const onMetadata = useCallback((video: HTMLVideoElement) => {
    videoRef.current = video;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0 || !video.videoWidth || !video.videoHeight) {
      setMediaError("无法读取视频时长或画面。请更换文件。");
      return;
    }
    setMeta({ width: video.videoWidth, height: video.videoHeight, fps: 30, duration });
    setTrim({ start: 0, end: duration });

    probeRef.current?.abort();
    const probe = new AbortController();
    probeRef.current = probe;
    void estimateVideoFps(video.currentSrc, probe.signal).then((fps) => {
      if (!probe.signal.aborted && videoRef.current === video) {
        setMeta((value) => value && { ...value, fps });
      }
    });
  }, []);

  const refreshFrame = useCallback(() => {
    const video = videoRef.current;
    if (!isReady || !video || !video.paused || video.seeking || video.readyState < 2 || jobRef.current) return;
    previewRef.current?.abort();
    const request = new AbortController();
    previewRef.current = request;
    void previewFrame(video, request.signal).catch((error) => {
      if (!request.signal.aborted) console.warn("预览跟踪失败", error);
    });
  }, [isReady, previewFrame]);

  useEffect(() => {
    if (!isReady) return;
    const video = videoRef.current;
    if (video && !video.paused) startTracking(video);
    else refreshFrame();
  }, [isReady, refreshFrame, startTracking]);

  const onPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused || jobRef.current) return;
    previewRef.current?.abort();
    setPlaying(true);
    startTracking(video);
  }, [startTracking]);

  const onPause = useCallback(() => {
    setPlaying(false);
    stopTracking();
  }, [stopTracking]);

  const onTimeUpdate = useCallback((video: HTMLVideoElement) => {
    if (videoRef.current !== video || jobRef.current) return;
    const end = stopAtRef.current;
    if (end !== null && video.currentTime >= end) {
      stopAtRef.current = null;
      video.pause();
      video.currentTime = end;
      setTime(end);
      return;
    }
    setTime(video.currentTime);
  }, []);

  const onSeeked = useCallback(() => {
    const video = videoRef.current;
    if (!video || jobRef.current) return;
    if (video.paused) refreshFrame();
    else startTracking(video);
  }, [refreshFrame, startTracking]);

  const onMediaError = useCallback(() => {
    onPause();
    probeRef.current?.abort();
    previewRef.current?.abort();
    jobRef.current?.abort();
    setMeta(null);
    setMediaError("浏览器无法解码这段视频。可尝试 H.264 编码的 MP4。");
  }, [onPause]);

  function seek(nextTime: number) {
    const video = videoRef.current;
    if (!video || jobRef.current || !Number.isFinite(nextTime)) return;
    stopAtRef.current = null;
    previewRef.current?.abort();
    if (!video.paused) {
      stopTracking();
      void resetTracking();
    }
    const target = limitTime(nextTime, duration);
    if (target !== video.currentTime) video.currentTime = target;
    if (!video.seeking) onSeeked();
    setTime(target);
  }

  async function play(selectionOnly = false) {
    const video = videoRef.current;
    if (!video || !duration || jobRef.current) return;
    if (!selectionOnly && !video.paused) {
      stopAtRef.current = null;
      video.pause();
      return;
    }
    if (selectionOnly) seek(trim.start);
    else if (video.ended) seek(0);
    stopAtRef.current = selectionOnly ? trim.end : null;
    try {
      await video.play();
    } catch (error) {
      if (videoRef.current === video && (error as Error).name !== "AbortError") {
        setMediaError("播放失败，请再试一次。");
      }
    }
  }

  function changeTrim(edge: keyof TrimRange, value: number) {
    if (jobRef.current || !Number.isFinite(value)) return;
    setTrim((previous) => setTrimBoundary(previous, edge, value, duration));
    setExportResult(null);
    setExportProgress(null);
  }

  function resetTrim() {
    if (jobRef.current) return;
    setTrim({ start: 0, end: duration });
    setExportResult(null);
    setExportProgress(null);
  }

  function changeConfig(partial: Partial<TrackerConfig>) {
    if (jobRef.current) return;
    setConfig((previous) => ({ ...previous, ...partial }));
    updateConfig(partial);
    refreshFrame();
  }

  function beginJob(kind: "scan" | "export") {
    const video = videoRef.current;
    if (!video || !isReady || !duration || jobRef.current) return;
    const job = new AbortController();
    jobRef.current = job;
    stopAtRef.current = null;
    previewRef.current?.abort();
    video.pause();
    onPause();
    setBusy(kind);
    return { video, job, originalTime: video.currentTime };
  }

  function finishJob(video: HTMLVideoElement, job: AbortController, originalTime: number) {
    if (jobRef.current !== job) return;
    jobRef.current = null;
    setBusy(null);
    if (!video.error) video.currentTime = originalTime;
    setTime(originalTime);
    if (!video.seeking) refreshFrame();
  }

  async function detectClimb() {
    const operation = beginJob("scan");
    if (!operation) return;
    const { video, job, originalTime } = operation;
    setScan({ state: "running", progress: 0 });

    try {
      await resetTracking();
      const scanFps = 3;
      const totalFrames = Math.ceil(duration * scanFps);
      const frames: ScanFrame[] = [];
      for (let index = 0; index < totalFrames; index++) {
        const time = index / scanFps;
        await seekVideoFrame(video, time, job.signal);
        const { person } = await processFrameRaw(video, job.signal);
        frames.push({
          time,
          personY: person ? person.bbox.y + person.bbox.height / 2 : null,
          personH: person?.bbox.height ?? null,
          hasDetection: !!person && !person.occluded,
        });
        if (index % 3 === 0) setScan({ state: "running", progress: (index + 1) / totalFrames });
      }

      const { detectClimbPhases } = await import("@/lib/climb-detector");
      job.signal.throwIfAborted();
      const phase = detectClimbPhases(frames, duration);
      const start = phase.wallOnTime >= 1 ? phase.wallOnTime : 0;
      const end = duration - phase.wallOffTime >= 1 ? phase.wallOffTime : duration;
      setScan(phase.confidence >= 0.55 && end - start >= 0.25 && (start > 0 || end < duration)
        ? { state: "suggestion", range: { start, end } }
        : { state: "empty" });
    } catch (error) {
      if (jobRef.current === job) {
        setScan(job.signal.aborted ? null : { state: "error", message: (error as Error).message });
      }
    } finally {
      finishJob(video, job, originalTime);
    }
  }

  function applySuggestion() {
    if (jobRef.current || scan?.state !== "suggestion") return;
    setTrim(scan.range);
    setScan(null);
    setExportResult(null);
    setExportProgress(null);
    seek(scan.range.start);
  }

  async function exportVideo(exportConfig: ExportConfig, debug: boolean, keepAudio: boolean) {
    if (!source) return;
    const operation = beginJob("export");
    if (!operation) return;
    const { video, job, originalTime } = operation;
    setExportResult(null);
    setExportProgress({ phase: "preparing", progress: 0, message: "准备导出…" });

    let audio: ExportAudio | null = null;
    try {
      await resetTracking();
      if (keepAudio) {
        const { openExportAudio } = await import("@/lib/export-audio");
        audio = await openExportAudio(source.media, trim.start, trim.end, job.signal);
      }

      const exporter = await import("@/lib/video-exporter");
      const createVideo = debug ? exporter.exportDebugVideo : exporter.exportTrackedVideo;
      let lastProgress = -Infinity;
      let lastPhase = "";
      const url = await createVideo(
        video, trim.start, trim.end,
        (frame) => processFrameRaw(frame, job.signal),
        exportConfig,
        (next) => {
          if (jobRef.current !== job || job.signal.aborted) return;
          const now = performance.now();
          if (now - lastProgress < 100 && next.phase === lastPhase) return;
          lastProgress = now;
          lastPhase = next.phase;
          setExportProgress(next);
        },
        job.signal,
        audio ?? undefined,
      );
      if (job.signal.aborted) URL.revokeObjectURL(url);
      else setExportResult({ url, debug });
    } catch (error) {
      if (jobRef.current === job) {
        setExportProgress(job.signal.aborted ? null : {
          phase: "error",
          progress: 0,
          message: (error as Error).message,
        });
      }
    } finally {
      audio?.close();
      finishJob(video, job, originalTime);
    }
  }

  return {
    source, meta, audioStatus, mediaError, duration, playing, time, trim, config, scan, busy, tracker,
    exportProgress, exportResult, loadSource, onMetadata, onPlay, onPause, onSeeked, onTimeUpdate,
    onMediaError, refreshFrame, seek, play, changeTrim, resetTrim, changeConfig, detectClimb,
    applySuggestion, exportVideo,
    dismissSuggestion: () => setScan(null),
    cancelJob: () => jobRef.current?.abort(),
    resetConfig: () => changeConfig(DEFAULT_SETTINGS),
  };
}
