/**
 * `@geomotion/evaluator` — `evaluate(document, t) -> Scene`.
 *
 * Governing sections: ENGINEERING_GUIDE §1.5, ARCHITECTURE §14. The pure function at
 * the centre of the architecture: same document and same time, same scene, every time.
 * It reads the document and produces plain values; it draws nothing and touches no DOM.
 *
 * A stray map event once re-rendered v1's export frames at the wrong `t` and silently
 * corrupted whole renders. Time is a parameter here and nowhere else.
 */

export {
  cameraAt,
  clearPathCache,
  evaluate,
  layerAlpha,
  resolveCamera,
  routePath,
  tourDuration,
  tourPhases,
  type CameraClaim,
  type CameraState,
  type Scene,
} from './scene.ts';
export { resolveTracks } from './resolve.ts';
