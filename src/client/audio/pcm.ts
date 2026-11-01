/** PCM 유틸: 바이트 ↔ Int16, 선형 보간 리샘플, Float32 변환 */

export function bytesToInt16(bytes: Uint8Array): Int16Array {
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const copy = new Uint8Array(even);
  copy.set(bytes.subarray(0, even));
  return new Int16Array(copy.buffer);
}

export function int16ToBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

export function resampleInt16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || input.length === 0) return input.slice();
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = Math.round(input[i0] * (1 - frac) + input[i1] * frac);
  }
  return out;
}

export function int16ToFloat32(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768;
  return out;
}

export function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** RMS를 dBFS로(무음은 -100) */
export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

/**
 * 스트리밍 청크 경계에서 홀수 바이트가 잘려 오는 경우를 처리하는 누적기
 */
export class Pcm16Accumulator {
  private carry: Uint8Array | null = null;

  push(chunk: Uint8Array): Int16Array {
    let bytes = chunk;
    if (this.carry) {
      const merged = new Uint8Array(this.carry.length + chunk.length);
      merged.set(this.carry);
      merged.set(chunk, this.carry.length);
      bytes = merged;
      this.carry = null;
    }
    if (bytes.length % 2 === 1) {
      this.carry = bytes.slice(bytes.length - 1);
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    return bytesToInt16(bytes);
  }
}
