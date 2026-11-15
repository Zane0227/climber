/** 等到指定位置的画面可以读取，并在视频出错或取消时释放监听器。 */
export async function seekVideoFrame(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  if (video.error) throw new Error("视频解码失败");
  if (video.currentTime !== time) video.currentTime = time;
  if (!video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;

  await new Promise<void>((resolve, reject) => {
    function finish(error?: unknown) {
      clearTimeout(timer);
      video.removeEventListener("seeked", checkFrame);
      video.removeEventListener("loadeddata", checkFrame);
      video.removeEventListener("canplay", checkFrame);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (error !== undefined) reject(error);
      else resolve();
    }

    function checkFrame() {
      if (!video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish();
    }

    const onError = () => finish(new Error("视频解码失败"));
    const onAbort = () => finish(signal?.reason);
    const timer = setTimeout(() => finish(new Error("等待视频画面超时")), 10_000);

    video.addEventListener("seeked", checkFrame);
    video.addEventListener("loadeddata", checkFrame);
    video.addEventListener("canplay", checkFrame);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 用独立的视频元素采样，避免探测改变预览的播放状态或位置。 */
export function estimateVideoFps(src: string, signal: AbortSignal): Promise<number> {
  const video = document.createElement("video");
  if (typeof video.requestVideoFrameCallback !== "function" || signal.aborted) {
    return Promise.resolve(30);
  }

  video.muted = true;
  video.playsInline = true;
  // 降低解码压力。采集的是源视频时间戳，播放速度不影响帧率计算。
  video.defaultPlaybackRate = 0.5;
  video.playbackRate = 0.5;

  return new Promise<number>((resolve) => {
    const intervals: number[] = [];
    let lastTime: number | undefined;
    let lastPresentedFrames = 0;
    let callbackId = 0;
    let finished = false;

    function finish(useSamples: boolean) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      video.cancelVideoFrameCallback(callbackId);
      signal.removeEventListener("abort", onFallback);
      video.removeEventListener("error", onFallback);
      video.removeEventListener("ended", onEnd);
      video.pause();
      video.removeAttribute("src");
      video.load();

      if (!useSamples || intervals.length === 0) {
        resolve(30);
        return;
      }

      // 较长的间隔可能跨过掉帧的位置，取较短一组的上界来过滤这些间隔。
      intervals.sort((a, b) => a - b);
      const fps = 1 / intervals[Math.floor((intervals.length - 1) / 4)];
      const common = [24, 25, 30, 48, 50, 60, 120];
      resolve(common.reduce((best, value) =>
        Math.abs(fps - value) < Math.abs(fps - best) ? value : best,
      ));
    }

    function onFrame(_now: number, { mediaTime, presentedFrames }: VideoFrameCallbackMetadata) {
      if (lastTime !== undefined && mediaTime > lastTime) {
        intervals.push((mediaTime - lastTime) / Math.max(1, presentedFrames - lastPresentedFrames));
      }
      lastTime = mediaTime;
      lastPresentedFrames = presentedFrames;

      if (intervals.length >= 20) finish(true);
      else callbackId = video.requestVideoFrameCallback(onFrame);
    }

    const onFallback = () => finish(false);
    const onEnd = () => finish(true);
    const timer = setTimeout(onEnd, 3_000);
    signal.addEventListener("abort", onFallback, { once: true });
    video.addEventListener("error", onFallback, { once: true });
    video.addEventListener("ended", onEnd, { once: true });
    video.src = src;
    callbackId = video.requestVideoFrameCallback(onFrame);
    void video.play().catch(onFallback);
  });
}
