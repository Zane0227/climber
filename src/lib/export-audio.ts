import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, type InputAudioTrack } from "mediabunny";

type PortableCodec = "aac" | "opus";
export type AudioStatus = "loading" | "supported" | "none" | "unsupported";

export interface ExportAudio {
  codec: PortableCodec;
  decoderConfig: AudioDecoderConfig;
  packets: AsyncIterable<{ data: Uint8Array; timestamp: number; duration: number }>;
  close(): void;
}

function openInput(file: Blob) {
  return new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
}

async function findTrack(input: Input): Promise<{
  track: InputAudioTrack;
  codec: PortableCodec;
} | "none" | "unsupported"> {
  const tracks = await input.getAudioTracks();
  for (const codec of ["aac", "opus"] as const) {
    for (const track of tracks) {
      if (await track.getCodec() === codec) return { track, codec };
    }
  }
  return tracks.length ? "unsupported" : "none";
}

export async function inspectExportAudio(file: Blob): Promise<AudioStatus> {
  const input = openInput(file);
  try {
    const result = await findTrack(input);
    return typeof result === "string" ? result : "supported";
  } catch {
    return "unsupported";
  } finally {
    input.dispose();
  }
}

export async function openExportAudio(
  file: Blob,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<ExportAudio | null> {
  const input = openInput(file);
  function close() {
    signal?.removeEventListener("abort", close);
    if (!input.disposed) input.dispose();
  }

  try {
    signal?.throwIfAborted();
    signal?.addEventListener("abort", close, { once: true });
    const result = await findTrack(input);
    if (typeof result === "string") {
      close();
      return null;
    }

    const { track, codec } = result;
    const decoderConfig = await track.getDecoderConfig();
    if (!decoderConfig) throw new Error("无法读取原声音轨。");

    // 用区间内第一个完整音频包作为起点，避免包含选区之前的声音。
    const sink = new EncodedPacketSink(track);
    const packet = await sink.getPacket(start);
    const first = packet
      ? (packet.timestamp < start ? await sink.getNextPacket(packet) : packet)
      : await sink.getFirstPacket();
    if (!first || first.timestamp >= end) {
      close();
      return null;
    }

    async function* packets() {
      for await (const packet of sink.packets(first ?? undefined)) {
        signal?.throwIfAborted();
        if (packet.timestamp >= end) break;
        yield {
          data: packet.data,
          timestamp: Math.round((packet.timestamp - start) * 1_000_000),
          duration: Math.round(Math.min(packet.duration, end - packet.timestamp) * 1_000_000),
        };
      }
    }

    return { codec, decoderConfig, packets: packets(), close };
  } catch (error) {
    close();
    throw error;
  }
}
