import { test } from "node:test";
import assert from "node:assert/strict";
import { clampTrim, mixToMono, sliceSeconds, resample, fade, encodeWav, clipToWav, MAX_SECONDS } from "../src/audio.js";

test("the selection is capped at 10 seconds", () => {
  assert.deepEqual(clampTrim(2, 30, 60), { start: 2, end: 2 + MAX_SECONDS });
});

test("start and end stay inside the clip and in order", () => {
  assert.deepEqual(clampTrim(-3, 99, 4), { start: 0, end: 4 });
  assert.deepEqual(clampTrim(3, 1, 4), { start: 3, end: 3 });
  assert.deepEqual(clampTrim("x", "y", 4), { start: 0, end: 0 });
});

test("an empty clip gives an empty selection", () => {
  assert.deepEqual(clampTrim(0, 5, 0), { start: 0, end: 0 });
});

test("stereo is averaged into mono", () => {
  const m = mixToMono([Float32Array.of(1, 0.5), Float32Array.of(-1, 0.5)]);
  assert.deepEqual([...m], [0, 0.5]);
});

test("slicing by seconds picks the right samples", () => {
  const s = Float32Array.from({ length: 100 }, (_, i) => i);
  assert.deepEqual([...sliceSeconds(s, 10, 1, 2)], [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});

test("resampling keeps the duration", () => {
  const s = new Float32Array(48000);
  assert.equal(resample(s, 48000, 24000).length, 24000);
  assert.equal(resample(s, 44100, 24000).length, Math.round((48000 * 24000) / 44100));
});

test("fade starts and ends at silence and keeps the middle", () => {
  const f = fade(new Float32Array(1000).fill(1), 1000, 10);
  assert.equal(f[0], 0);
  assert.equal(f[999], 0);
  assert.equal(f[500], 1);
});

test("the WAV header describes 16 bit mono PCM", () => {
  const w = encodeWav(Float32Array.of(0, 1, -1), 24000);
  const v = new DataView(w.buffer);
  const tag = (o) => String.fromCharCode(...w.subarray(o, o + 4));
  assert.equal(tag(0), "RIFF");
  assert.equal(tag(8), "WAVE");
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 24000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 6);
  assert.equal(w.length, 44 + 6);
  assert.equal(v.getInt16(46, true), 0x7fff);
  assert.equal(v.getInt16(48, true), -0x8000);
});

test("a long clip becomes at most 10 seconds of WAV", () => {
  const rate = 48000;
  const ch = new Float32Array(rate * 25).fill(0.1);
  const w = clipToWav([ch, ch], rate, 0, 25);
  const v = new DataView(w.buffer);
  assert.equal(v.getUint32(40, true) / 2 / 24000, MAX_SECONDS);
});

test("resampling interpolates between samples", () => {
  // A ramp stays a ramp: doubling the rate puts the midpoints between neighbours.
  const up = resample(Float32Array.of(0, 1, 2, 3), 1, 2);
  assert.deepEqual([...up], [0, 0.5, 1, 1.5, 2, 2.5, 3, 3]);
  const down = resample(Float32Array.of(0, 1, 2, 3, 4, 5), 3, 2);
  assert.deepEqual([...down], [0, 1.5, 3, 4.5]);
});
