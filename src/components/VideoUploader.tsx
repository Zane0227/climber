"use client";

import { useId, useState, type DragEvent } from "react";
import Icon from "./Icon";

export default function VideoUploader({ compact = false, onFile }: {
  compact?: boolean;
  onFile: (file: File) => void;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  const input = (
    <input id={inputId} type="file" accept="video/*,.mov,.mp4,.webm" className="visually-hidden file-input"
      aria-label={compact ? "更换视频" : "导入视频"}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) onFile(file);
        event.currentTarget.value = "";
      }} />
  );

  if (compact) return (
    <div className="upload-compact">{input}
      <label htmlFor={inputId} className="button"><Icon name="upload" /> 更换视频</label>
    </div>
  );

  return (
    <div className={`drop-zone${dragging ? " is-dragging" : ""}`} onDrop={onDrop}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}>
      <div className="upload-symbol"><Icon name="film" /></div>
      {input}
      <label htmlFor={inputId} className="button button-primary upload-button"><Icon name="upload" /> 导入视频</label>
      <p>也可将 MP4、MOV 或 WebM 拖到这里</p>
    </div>
  );
}
