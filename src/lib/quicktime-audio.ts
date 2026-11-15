interface Box {
  type: string;
  start: number;
  data: number;
  end: number;
}

function readBox(view: DataView, start: number, limit: number): Box | undefined {
  if (start + 8 > limit || start + 8 > view.byteLength) return;
  const size32 = view.getUint32(start);
  const data = start + (size32 === 1 ? 16 : 8);
  if (data > limit || data > view.byteLength) return;
  const size = size32 === 1 ? Number(view.getBigUint64(start + 8)) : size32 || limit - start;
  if (!Number.isSafeInteger(size) || size < data - start || size > limit - start) return;
  return { type: readType(view, start + 4), start, data, end: start + size };
}

function readType(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3),
  );
}

function* children(view: DataView, start: number, end: number) {
  for (let offset = start; offset < end;) {
    const box = readBox(view, offset, end);
    if (!box) return;
    yield box;
    offset = box.end;
  }
}

function child(view: DataView, parent: Box, type: string): Box | undefined {
  for (const box of children(view, parent.data, parent.end)) {
    if (box.type === type) return box;
  }
}

function audioCodec(view: DataView, track: Box) {
  const media = child(view, track, "mdia");
  const handler = media && child(view, media, "hdlr");
  if (!media || !handler || handler.data + 12 > handler.end || readType(view, handler.data + 8) !== "soun") {
    return;
  }

  const information = child(view, media, "minf");
  const table = information && child(view, information, "stbl");
  const descriptions = table && child(view, table, "stsd");
  if (!descriptions || descriptions.data + 8 > descriptions.end) return;
  return readBox(view, descriptions.data + 8, descriptions.end)?.type;
}

/** 让浏览器直接播放 APAC 影片自带的立体声 AAC。媒体数据和原文件偏移保持原样。 */
export async function preferStereoInQuickTime(file: File): Promise<Blob> {
  if (!/\.(mov|mp4|m4v)$/i.test(file.name) && !/video\/(quicktime|mp4)/i.test(file.type)) return file;

  for (let offset = 0; offset < file.size;) {
    const header = new DataView(await file.slice(offset, offset + 16).arrayBuffer());
    const box = readBox(header, 0, file.size - offset);
    if (!box || box.type === "moof") return file;
    if (box.type === "moov") {
      const view = new DataView(await file.slice(offset, offset + box.end).arrayBuffer());
      const movie = readBox(view, 0, view.byteLength);
      if (!movie || child(view, movie, "mvex")) return file;

      const spatial: Box[] = [];
      let stereoHeader: Box | undefined;
      for (const track of children(view, movie.data, movie.end)) {
        if (track.type !== "trak") continue;
        const codec = audioCodec(view, track);
        if (codec === "mp4a" && !stereoHeader) stereoHeader = child(view, track, "tkhd");
        if (codec === "apac") spatial.push(track);
      }
      if (!spatial.length || !stereoHeader || stereoHeader.data + 4 > stereoHeader.end) return file;

      // 保持 moov 长度及媒体块偏移，隐藏 APAC 的描述并启用原本未启用的 AAC。
      for (const track of spatial) view.setUint32(track.start + 4, 0x66726565); // free
      const flags = stereoHeader.data + 3;
      view.setUint8(flags, view.getUint8(flags) | 0x03); // track_enabled, track_in_movie

      return new Blob([file.slice(0, offset), view.buffer, file.slice(offset + box.end)], { type: file.type });
    }
    offset += box.end;
  }

  return file;
}
