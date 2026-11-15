"use client";

import { useRef, useEffect, useEffectEvent } from "react";
import type { Viewport, TrackedPerson } from "@/lib/tracker-types";
import Icon from "./Icon";

export type PreviewMode = "tracked" | "original" | "debug";

interface VideoTrackerProps {
  viewport: Viewport | null;
  person: TrackedPerson | null;
  mode: PreviewMode;
  busy: boolean;
  mediaReady: boolean;
  mediaError: string | null;
  muted: boolean;
  source: string;
  onMetadata: (video: HTMLVideoElement) => void;
  onPlay: () => void;
  onPause: () => void;
  onError: () => void;
  onSeeked: () => void;
  onTimeUpdate: (video: HTMLVideoElement) => void;
}

const FULL_FRAME: Viewport = { x: 0, y: 0, width: 1, height: 1 };

export default function VideoTracker({
  viewport, person, mode, busy, mediaReady, mediaError, muted, source,
  onMetadata, onPlay, onPause, onError, onSeeked, onTimeUpdate,
}: VideoTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cropRef = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLCanvasElement>(null);

  const renderFrame = useEffectEvent(() => {
    const video = videoRef.current;
    const canvas = cropRef.current;
    if (busy || !video || !canvas || video.seeking || video.readyState < 2 || !video.videoWidth) return;

    const crop = mode === "original" ? FULL_FRAME : viewport ?? FULL_FRAME;
    const context = fitCanvas(canvas, video.videoWidth / video.videoHeight);
    if (context) {
      context.drawImage(video, crop.x * video.videoWidth, crop.y * video.videoHeight,
        crop.width * video.videoWidth, crop.height * video.videoHeight, 0, 0, canvas.width, canvas.height);
    }

    if (mode === "debug" && debugRef.current) {
      drawDebugFrame(debugRef.current, video, crop, person);
    }
  });

  useEffect(() => {
    const element = videoRef.current;
    const stage = stageRef.current;
    if (!element || !stage) return;
    const video = element;

    const videoFrames = typeof video.requestVideoFrameCallback === "function";
    let frameId: number | null = null;
    let lastTime = -1;

    function schedule() {
      if (frameId !== null || video.paused || video.ended) return;
      frameId = videoFrames
        ? video.requestVideoFrameCallback(drawNext)
        : requestAnimationFrame(drawNext);
    }

    function drawNext() {
      frameId = null;
      if (videoFrames || video.currentTime !== lastTime) draw();
      schedule();
    }

    function draw() {
      lastTime = video.currentTime;
      renderFrame();
    }

    function stop() {
      if (frameId === null) return;
      if (videoFrames) video.cancelVideoFrameCallback(frameId);
      else cancelAnimationFrame(frameId);
      frameId = null;
    }

    function pause() {
      stop();
      draw();
    }

    const redrawEvents = ["loadeddata", "seeked", "ended"];
    const observer = new ResizeObserver(draw);
    observer.observe(stage);
    for (const event of redrawEvents) video.addEventListener(event, draw);
    video.addEventListener("playing", schedule);
    video.addEventListener("pause", pause);
    draw();
    schedule();

    return () => {
      stop();
      observer.disconnect();
      for (const event of redrawEvents) video.removeEventListener(event, draw);
      video.removeEventListener("playing", schedule);
      video.removeEventListener("pause", pause);
    };
  }, []);

  useEffect(() => {
    if (videoRef.current?.paused) renderFrame();
  }, [viewport, person, mode, busy]);

  return (
    <>
      <video ref={videoRef} hidden src={source} muted={muted} playsInline preload="auto"
        onLoadedMetadata={(event) => onMetadata(event.currentTarget)}
        onLoadedData={onSeeked} onPlaying={onPlay} onPause={onPause} onEnded={onPause}
        onError={onError} onSeeked={onSeeked} onTimeUpdate={(event) => onTimeUpdate(event.currentTarget)} />
      <div className={`preview-stage${mode === "debug" ? " preview-split" : ""}`} ref={stageRef}>
        <div className="preview-pane">
          <canvas ref={cropRef} className="preview-canvas" role="img" aria-label={mode === "original" ? "原片画面" : "跟踪裁切画面"} />
          {mode === "debug" && mediaReady && <span className="preview-caption">跟踪裁切</span>}
        </div>
        {mode === "debug" && (
          <div className="preview-pane">
            <canvas ref={debugRef} className="preview-canvas" role="img" aria-label="原片跟踪关键点" />
            {mediaReady && <span className="preview-caption">原片与关键点</span>}
          </div>
        )}
        {!mediaReady && (
          <div className="stage-message" role={mediaError ? "alert" : "status"}>
            <Icon name="film" />
            <span>{mediaError || "正在读取视频…"}</span>
          </div>
        )}
      </div>
    </>
  );
}

function fitCanvas(canvas: HTMLCanvasElement, aspect: number) {
  const pane = canvas.parentElement;
  if (!pane?.clientWidth || !pane.clientHeight) return null;
  const cssWidth = Math.max(1, Math.floor(Math.min(pane.clientWidth, pane.clientHeight * aspect)));
  const cssHeight = Math.max(1, Math.floor(cssWidth / aspect));
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(cssWidth * scale);
  const height = Math.round(cssHeight * scale);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  if (canvas.style.width !== `${cssWidth}px`) canvas.style.width = `${cssWidth}px`;
  if (canvas.style.height !== `${cssHeight}px`) canvas.style.height = `${cssHeight}px`;
  return canvas.getContext("2d");
}

function drawDebugFrame(canvas: HTMLCanvasElement, video: HTMLVideoElement, crop: Viewport, person: TrackedPerson | null) {
  const context = fitCanvas(canvas, video.videoWidth / video.videoHeight);
  if (!context) return;
  const { width, height } = canvas;
  context.drawImage(video, 0, 0, width, height);
  context.strokeStyle = "#ddf64d";
  context.lineWidth = 2;
  context.strokeRect(crop.x * width, crop.y * height, crop.width * width, crop.height * height);
  if (!person) return;

  const { bbox } = person;
  context.strokeStyle = person.occluded ? "#fb7878" : "#f8bc7c";
  context.setLineDash(person.occluded ? [4, 4] : []);
  context.strokeRect(bbox.x * width, bbox.y * height, bbox.width * width, bbox.height * height);
  context.setLineDash([]);
  context.fillStyle = context.strokeStyle;

  for (const point of person.keypoints) {
    if ((point.score ?? 0) < 0.3) continue;
    context.beginPath();
    context.arc(point.x * width / video.videoWidth, point.y * height / video.videoHeight, 2.5, 0, Math.PI * 2);
    context.fill();
  }
}
