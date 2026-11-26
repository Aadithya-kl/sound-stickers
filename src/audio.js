// Audio trimming and WAV encoding. No DOM here, so it runs under `node --test`.
// WhatsApp's sound sticker beta allows up to 10 s of audio for an image sticker.

export const MAX_SECONDS = 10;
export const WAV_RATE = 24000;

/** Keeps start and end inside the clip and the selection at most `max` seconds long. */
export function clampTrim(start, end, duration, max = MAX_SECONDS) {
  if (!(duration > 0)) return { start: 0, end: 0 };
  let s = Math.min(Math.max(0, Number(start) || 0), duration);
  let e = Math.min(Math.max(s, Number(end) || 0), duration);
  if (e - s > max) e = s + max;
  return { start: s, end: e };
}

/** Averages any number of channels (Float32Array each) into one. */
export function mixToMono(channels) {
  if (!channels.length) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** Samples between start and end seconds. */
export function sliceSeconds(samples, rate, start, end) {
  const a = Math.max(0, Math.floor(start * rate));
  const b = Math.min(samples.length, Math.max(a, Math.round(end * rate)));
  return samples.subarray(a, b);
}

/** Linear resampling; good enough for short voice and sound clips. */
export function resample(samples, from, to) {
  if (from === to) return Float32Array.from(samples);
  const n = Math.max(0, Math.round((samples.length * to) / from));
  const out = new Float32Array(n);
  const step = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const t = x - j;
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a + (b - a) * t;
  }
  return out;
}

/** Short fade in and out (ms) so the cut doesn't click. */
export function fade(samples, rate, ms = 15) {
  const out = Float32Array.from(samples);
  const n = Math.min(Math.floor((rate * ms) / 1000), Math.floor(out.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

/** 16 bit PCM mono WAV. Returns a Uint8Array. */
export function encodeWav(samples, rate) {
  const bytes = 44 + samples.length * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const text = (off, s) => [...s].forEach((ch, i) => v.setUint8(off + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Whole pipeline: channels at `rate` -> trimmed, mono, resampled, faded WAV bytes. */
export function clipToWav(channels, rate, start, end, outRate = WAV_RATE) {
  const mono = mixToMono(channels);
  const t = clampTrim(start, end, mono.length / rate);
  const cut = sliceSeconds(mono, rate, t.start, t.end);
  return encodeWav(fade(resample(cut, rate, outRate), outRate), outRate);
}
