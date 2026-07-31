/**
 * `@geomotion/document` — the document model.
 *
 * Governing sections: ENGINEERING_GUIDE §3, ARCHITECTURE §04. Depends on `core`
 * only; it must never reach for React, the renderer, or the DOM. Browser
 * persistence therefore lives in the app, not here.
 *
 * The store is §04 Decision 01's shape: one flat `nodes` record keyed by id, each node
 * carrying `parentId` and a fractional-index `order`, with every ordered list — layers in
 * draw order, cameras, children — derived (see nodes.ts, order.ts). What is not built yet
 * is the *schema registry* §3.4 asks for: node types still declare themselves as members of
 * a union with hand-written defaults rather than registering zod schemas and property
 * metadata.
 */

export { createLayer, defaultTour, emptyProject, migrate, projectWith } from './project.ts';
export {
  cameraFromShots,
  createCamera,
  keyframe,
  patchShot,
  removeShot,
  shotAt,
  shotsOf,
  upsertShot,
} from './camera.ts';
export {
  canPlayPerCue,
  envelopeOf,
  gainCurve,
  isRetimable,
  planAudio,
  scheduleFrom,
  type AudioPlan,
  type ClipEnvelope,
  type GainPoint,
  type RemixClip,
  type ScheduledCue,
} from './audio.ts';
export {
  addNode,
  camerasOf,
  childrenOf,
  descendantsOf,
  isCameraNode,
  isLayerNode,
  layerAt,
  layersOf,
  liveCamera,
  moveNodeBy,
  nodeAt,
  nodesOf,
  removeNode,
  setNodeParent,
  type DocNode,
  type NodeId,
  type NodeStore,
} from './nodes.ts';
export { FIRST_ORDER, compareOrder, orderBetween, orderKeys } from './order.ts';
export { History } from './history.ts';
export { applyPatches, isNoop, transact, type Patch, type Transaction } from './transact.ts';
export type * from './types.ts';

export {
  KEY_EPSILON,
  TRACK_KINDS,
  coerceTrack,
  hasKeyAt,
  toKeyframed,
  trackedProps,
  windowOf,
  withKeyMoved,
  withValueAt,
  withoutKeyAt,
  isAnimated,
  isTrack,
  keyframedTrack,
  restValue,
  staticTrack,
  type Behaviour,
  type BehaviourStacks,
  type BehaviourType,
  type Keyframe,
  type Track,
} from './track.ts';
export { windowTrack } from './project.ts';
export { CURRENT_FORMAT, formatOf, runMigrations } from './migrations/index.ts';
export { blockAt, blocksFor, storyEnd, storyInOrder, type StoryBlock } from './story.ts';
export { cuesIn, rippleBlockLength, rippleBlockTo, shiftCue, shiftLayer, type RippleResult } from './ripple.ts';
export { resolveMapContext, type MapContext, type ResolvedContext } from './context.ts';
