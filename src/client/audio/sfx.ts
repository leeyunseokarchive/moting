"use client";

/** 대기 연출용 아주 작은 효과음(서류 넘기는 소리, 펜 소리). 외부 파일 없이 합성한다. */
let ctx: AudioContext | null = null;

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function noiseBurst(durationSec: number, freq: number, q: number, gain: number, when = 0) {
  const c = audio();
  const len = Math.floor(c.sampleRate * durationSec);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + when);
}

/** 배음을 얹은 사인파를 지수 감쇠시켜 벨 소리를 만든다 */
function bell(freq: number, when: number) {
  const c = audio();
  const start = c.currentTime + when;
  for (const [ratio, level] of [[1, 0.28], [2, 0.09], [3, 0.03]]) {
    const end = start + 1.5 / ratio;
    const osc = c.createOscillator();
    osc.frequency.value = freq * ratio;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g).connect(c.destination);
    osc.start(start);
    osc.stop(end);
  }
}

/** 소리 확인용 '띵동' (미→도) */
export function chime() {
  bell(659.25, 0);
  bell(523.25, 0.38);
}

export function paperFlip() {
  noiseBurst(0.22, 2400, 0.8, 0.05);
  noiseBurst(0.16, 3200, 0.9, 0.035, 0.18);
}

export function penScratch() {
  for (let i = 0; i < 4; i++) noiseBurst(0.07, 5200 + i * 300, 4, 0.02, i * 0.11);
}
