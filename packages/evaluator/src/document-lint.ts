/**
 * Static document checks — defects you can find by reading the project, with no
 * camera, no rendering and no browser.
 *
 * Separate from `lint.ts` because that file is about *geography* — coordinates that
 * cross the antimeridian, routes that cross land. These are about the document
 * disagreeing with what its author meant, and share none of its machinery.
 *
 * Both checks here exist because the failure they catch is *plausible output*, not an
 * error: a map in the wrong colours and an ending that dissolves both render happily,
 * report success at every step, and are only visible to someone watching the finished
 * file closely enough to doubt it.
 */
import type { Project } from '@geomotion/document';
import { layersOf } from '@geomotion/document';
import { DIVERGING_RAMPS, RAMPS } from '@geomotion/core';

export interface DocumentFinding {
  layerId: string;
  layerName: string;
  kind: 'unknown-ramp' | 'fades-at-end';
  detail: string;
}

/** Every ramp id this build can actually resolve, both registries. */
const knownRamps = (): Set<string> =>
  new Set([...RAMPS.map((r) => r.id), ...DIVERGING_RAMPS.map((r) => r.id)]);

export function checkProjectDocument(project: Project): DocumentFinding[] {
  const findings: DocumentFinding[] = [];
  const known = knownRamps();
  const duration = project.duration;

  for (const layer of layersOf(project)) {
    /*
     * A ramp name nothing registers.
     *
     * `getRamp` falls back to the first sequential ramp rather than throwing, which is
     * right at draw time — a frame with the wrong colours beats a frame that does not
     * exist. But it means a typo, or a ramp added to the source without rebuilding the
     * renderer's bundle, produces a complete, plausible, entirely wrongly-coloured map
     * with no warning at any layer. That is the whole reason this check exists: it
     * happened, and the map was blue for a full render before anyone asked why.
     */
    if (layer.type === 'regions' && !known.has(layer.ramp)) {
      findings.push({
        layerId: layer.id,
        layerName: layer.name,
        kind: 'unknown-ramp',
        detail:
          `ramp "${layer.ramp}" is not registered — the render will silently use ` +
          `"${RAMPS[0].id}". Known: ${[...known].join(', ')}`,
      });
    }

    /*
     * A layer that is still on screen at the end, and fading as it gets there.
     *
     * Every layer fades over its own `fade` as it approaches `out`, including one whose
     * `out` is exactly the project duration — which turns "the film ends here" into "the
     * film dissolves as it ends", invisibly, because the layer list looks correct either
     * way. The fix is to push anything meant to hold to the end past the visible
     * timeline (`out: duration + margin`).
     *
     * Only layers whose `out` lands inside the final fade are flagged. A layer that ends
     * in the middle of the piece is an ordinary edit, not a defect, and flagging those
     * would make this noisy enough to ignore.
     */
    if (layer.visible !== false && layer.fade > 0 && layer.in < duration) {
      const endsWithin = layer.out <= duration + 1e-6 && layer.out > duration - layer.fade;
      if (endsWithin) {
        findings.push({
          layerId: layer.id,
          layerName: layer.name,
          kind: 'fades-at-end',
          detail:
            `out=${layer.out.toFixed(2)} with fade=${layer.fade.toFixed(2)} against a ` +
            `${duration.toFixed(2)}s project — it is dissolving on the last frame. ` +
            `Push out past the end (${(duration + 1).toFixed(2)}) to hold it.`,
        });
      }
    }
  }

  return findings;
}
