"use client";

import type { FaceSample } from "../metrics";

type Landmarker = {
  detectForVideo(
    video: HTMLVideoElement,
    ts: number,
  ): {
    faceLandmarks: { x: number; y: number; z: number }[][];
    faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
  };
  close(): void;
};

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/**
 * 표정·시선 분석. 영상은 브라우저 안에서만 처리하고 수치만 남긴다.
 * 초당 약 4회 샘플링해 CPU 부담을 줄인다.
 */
export class FaceTracker {
  private landmarker: Landmarker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  samples: FaceSample[] = [];
  ready = false;

  async init(): Promise<boolean> {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const files = await vision.FilesetResolver.forVisionTasks(WASM);
      this.landmarker = (await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
      })) as unknown as Landmarker;
      this.ready = true;
      return true;
    } catch (e) {
      console.warn("[face] 초기화 실패", e);
      return false;
    }
  }

  start(video: HTMLVideoElement, now: () => number) {
    this.stop();
    if (!this.landmarker) return;
    this.timer = setInterval(() => {
      if (!this.landmarker || video.readyState < 2 || video.paused) return;
      try {
        const r = this.landmarker.detectForVideo(video, performance.now());
        const lm = r.faceLandmarks[0];
        if (!lm) {
          this.samples.push({ t: now(), away: true, nose: [0.5, 0.5], smile: 0, blink: 0 });
          return;
        }
        const cats = Object.fromEntries((r.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));
        // 시선: 눈동자가 한쪽으로 크게 쏠리거나 고개가 많이 돌아가면 이탈로 본다
        const lookSide = Math.max(
          (cats.eyeLookOutLeft ?? 0) + (cats.eyeLookInRight ?? 0),
          (cats.eyeLookInLeft ?? 0) + (cats.eyeLookOutRight ?? 0),
        ) / 2;
        const lookDown = ((cats.eyeLookDownLeft ?? 0) + (cats.eyeLookDownRight ?? 0)) / 2;
        const nose = lm[1];
        const leftCheek = lm[234];
        const rightCheek = lm[454];
        const yaw = (nose.x - (leftCheek.x + rightCheek.x) / 2) / Math.max(0.01, rightCheek.x - leftCheek.x);
        const away = lookSide > 0.5 || lookDown > 0.55 || Math.abs(yaw) > 0.18;
        this.samples.push({
          t: now(),
          away,
          nose: [nose.x, nose.y],
          smile: ((cats.mouthSmileLeft ?? 0) + (cats.mouthSmileRight ?? 0)) / 2,
          blink: ((cats.eyeBlinkLeft ?? 0) + (cats.eyeBlinkRight ?? 0)) / 2,
        });
      } catch {
        /* 프레임 하나 실패는 무시 */
      }
    }, 250);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  close() {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
  }
}
