import { useEffect, useState } from "react";
import { seekVideoFrame } from "@/lib/video-frames";

const FRAME_COUNT = 8;

export function useFilmstrip(src: string, duration: number) {
  const [result, setResult] = useState<{ src: string; frames: string[] } | null>(null);

  useEffect(() => {
    if (duration <= 0) return;
    const controller = new AbortController();
    const { signal } = controller;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;

    async function sample() {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 72;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      try {
        video.src = src;
        await seekVideoFrame(video, 0, signal);
        const frames: string[] = [];
        const width = Math.min(video.videoWidth, video.videoHeight * 16 / 9);
        const height = width * 9 / 16;
        for (let i = 0; i < FRAME_COUNT; i++) {
          await seekVideoFrame(video, duration * (i + 0.5) / FRAME_COUNT, signal);
          ctx.drawImage(video, (video.videoWidth - width) / 2, (video.videoHeight - height) / 2,
            width, height, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.68));
        }
        signal.throwIfAborted();
        setResult({ src, frames });
      } catch {
        // 时间轴可在缩略图加载失败时继续操作。
      } finally {
        video.removeAttribute("src");
        video.load();
      }
    }

    const timer = setTimeout(() => void sample(), 1400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [src, duration]);

  return result?.src === src ? result.frames : [];
}
