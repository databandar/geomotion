/**
 * `@geomotion/renderer` — what a frame is, and how it is drawn.
 *
 * Governing sections: ENGINEERING_GUIDE §2, ARCHITECTURE §14. This is the 2D
 * compositor: it takes a scene of plain values and paints the overlay. It never sees
 * the document — `styles.ts` declares exactly the fields it is allowed to read.
 *
 * The DOM is fair game here, unlike in the other packages: a canvas renderer without
 * a canvas is not a useful abstraction.
 */

export { drawOverlay, scaleFor, type OverlayFrame, type ProjectFn } from './overlay.ts';
export {
  formatValue,
  legendMetrics,
  placeReadout,
  scaleAt,
  type LegendMetrics,
  type ReadoutPlacement,
} from './legend.ts';
export { cloudTexture, scratchCanvas } from './clouds.ts';
export { getImage, imagesReady } from './images.ts';
export type * from './scene-types.ts';
export type * from './styles.ts';
