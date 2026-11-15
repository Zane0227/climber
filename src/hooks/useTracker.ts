"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import type { ClimbingTrackerEngine } from "@/lib/tracker-engine";
import type { TrackedPerson, TrackerConfig, Viewport } from "@/lib/tracker-types";

export function useTracker(initialConfig: Partial<TrackerConfig>, enabled: boolean) {
  const configRef = useRef(initialConfig);
  const engineRef = useRef<ClimbingTrackerEngine | null>(null);
  const trackingRef = useRef<{ rafId: number | null } | null>(null);
  const pendingFrameRef = useRef<Promise<void> | null>(null);
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [modelAttempt, setModelAttempt] = useState(0);
  const retryModel = useCallback(() => {
    setModelState("loading");
    setModelAttempt((attempt) => attempt + 1);
  }, []);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [person, setPerson] = useState<TrackedPerson | null>(null);

  const cancelTracking = useCallback(() => {
    const tracking = trackingRef.current;
    trackingRef.current = null;
    if (tracking?.rafId != null) cancelAnimationFrame(tracking.rafId);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    async function initEngine() {
      try {
        const { ClimbingTrackerEngine } = await import("@/lib/tracker-engine");
        if (disposed) return;
        const engine = new ClimbingTrackerEngine(configRef.current);
        await engine.init();
        if (disposed) {
          await engine.dispose();
          return;
        }
        engine.updateConfig(configRef.current ?? {});
        engineRef.current = engine;
        setModelState("ready");
      } catch (error) {
        if (disposed) return;
        console.error("模型加载失败:", error);
        setModelState("error");
      }
    }

    void initEngine();
    return () => {
      disposed = true;
      cancelTracking();
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) {
        void (pendingFrameRef.current ?? Promise.resolve()).then(() => engine.dispose());
      }
    };
  }, [enabled, modelAttempt, cancelTracking]);

  const runFrame = useCallback(async (
    video: HTMLVideoElement,
    raw = false,
    signal?: AbortSignal,
    reset = false,
  ) => {
    while (pendingFrameRef.current) await pendingFrameRef.current;
    signal?.throwIfAborted();
    const engine = engineRef.current;
    if (!engine) throw new Error("引擎未初始化");

    if (reset) engine.reset();
    const frame = raw ? engine.processFrameRaw(video) : engine.processFrame(video);
    const pending = frame.then(() => {}, () => {});
    pendingFrameRef.current = pending;
    try {
      const result = await frame;
      signal?.throwIfAborted();
      return result;
    } finally {
      pendingFrameRef.current = null;
    }
  }, []);

  const startTracking = useCallback((video: HTMLVideoElement) => {
    if (!engineRef.current || trackingRef.current || video.paused) return;

    const tracking = { rafId: null as number | null };
    trackingRef.current = tracking;

    let lastTime = -Infinity;
    let lastVideoTime = -1;
    const frameInterval = 1000 / 20;

    const loop = async (timestamp: number) => {
      tracking.rafId = null;
      if (trackingRef.current !== tracking) return;

      if (timestamp - lastTime >= frameInterval && !pendingFrameRef.current &&
          video.readyState >= 2 && !video.paused && !video.seeking && video.currentTime !== lastVideoTime) {
        lastTime = timestamp;
        lastVideoTime = video.currentTime;
        try {
          const result = await runFrame(video);
          if (trackingRef.current !== tracking) return;
          setViewport(result.viewport);
          setPerson(result.person);

        } catch {
          // 偶发的帧处理错误可以在下一帧恢复。
        }
      }

      if (trackingRef.current === tracking) tracking.rafId = requestAnimationFrame(loop);
    };

    tracking.rafId = requestAnimationFrame(loop);
  }, [runFrame]);

  const resetTracking = useCallback(async () => {
    setViewport(null);
    setPerson(null);
    const engine = engineRef.current;
    if (pendingFrameRef.current) await pendingFrameRef.current;
    if (engine === engineRef.current) engine?.reset();
  }, []);

  const updateConfig = useCallback((partial: Partial<TrackerConfig>) => {
    configRef.current = { ...configRef.current, ...partial };
    engineRef.current?.updateConfig(partial);
  }, []);

  const processFrameRaw = useCallback((video: HTMLVideoElement, signal: AbortSignal) => {
    return runFrame(video, true, signal);
  }, [runFrame]);

  const previewFrame = useCallback(async (video: HTMLVideoElement, signal: AbortSignal) => {
    const result = await runFrame(video, true, signal, true);
    signal.throwIfAborted();
    setViewport(result.viewport);
    setPerson(result.person);
  }, [runFrame]);

  return {
    isReady: modelState === "ready",
    modelState,
    retryModel,
    previewFrame,
    viewport,
    person,
    startTracking,
    stopTracking: cancelTracking,
    resetTracking,
    updateConfig,
    processFrameRaw,
  };
}
