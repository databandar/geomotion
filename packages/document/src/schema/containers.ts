/**
 * The node types that are not layers: the group, and the camera.
 *
 * Registered alongside the seven layer types so the editor has one list to read — "what
 * kinds of node exist, what does a fresh one hold, and how is each property edited". A
 * camera's channels are not ordinary properties (a shot writes four of them at once through
 * `upsertShot`), so all four are marked custom: the metadata says so out loud rather than
 * leaving the generated inspector to render a control that would write half a shot.
 */
import { createId } from '@geomotion/core';
import { createCamera } from '../camera.ts';
import { FIRST_ORDER } from '../order.ts';
import { staticTrack } from '../track.ts';
import type { MapContextNode } from '../context.ts';
import type { GroupNode } from '../types.ts';
import type { NodeTypeDef } from './meta.ts';

export function createGroup(name = 'Group'): GroupNode {
  return {
    id: createId(),
    type: 'group',
    name,
    // Placed by `addNode`, like every other node — a constructor cannot know its siblings.
    parentId: null,
    order: FIRST_ORDER,
    visible: true,
    opacity: staticTrack(1),
    behaviours: {},
  };
}

export const groupType: NodeTypeDef = {
  type: 'group',
  kind: 'Group',
  create: () => createGroup(),
  props: [
    {
      prop: 'opacity',
      label: 'Opacity',
      help: 'Multiplies into everything in the group, so a beat fades as one thing.',
      row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 },
    },
    { prop: 'name', label: 'Name', custom: true, row: { kind: 'text' } },
    { prop: 'visible', label: 'Visible', custom: true, row: { kind: 'toggle' } },
    { prop: 'locked', label: 'Locked', custom: true, optional: true, row: { kind: 'toggle' } },
    { prop: 'behaviours', label: 'Behaviours', custom: true, row: { kind: 'toggle' } },
    { prop: 'id', label: 'Id', custom: true, row: { kind: 'text' } },
    { prop: 'type', label: 'Type', custom: true, row: { kind: 'text' } },
    { prop: 'parentId', label: 'Parent', custom: true, row: { kind: 'text' } },
    { prop: 'order', label: 'Order', custom: true, row: { kind: 'text' } },
  ],
};

/**
 * A map context: what the map looks like, and what belongs to that look.
 *
 * Every setting is optional and absent means "the project's own" — the partial override that
 * keeps a context that switches the basemap down to one field. The metadata therefore
 * describes them as ordinary rows; a row left at the project's value writes nothing.
 */
export function createMapContext(name = 'Map context'): MapContextNode {
  return {
    id: createId(),
    type: 'mapContext',
    name,
    parentId: null,
    order: FIRST_ORDER,
    visible: true,
    behaviours: {},
  };
}

export const mapContextType: NodeTypeDef = {
  type: 'mapContext',
  kind: 'Map context',
  create: () => createMapContext(),
  props: [
    {
      prop: 'basemap',
      optional: true,
      label: 'Basemap',
      section: 'Map',
      help: 'What the ground is. Left alone, the project’s own basemap applies.',
      // The ids live in `@geomotion/map`, which this package may not depend on (§2), so the
      // metadata names a source and the app supplies the list.
      row: { kind: 'select', optionsFrom: 'basemap' },
    },
    { prop: 'terrain', label: 'Terrain', section: 'Map', optional: true, row: { kind: 'toggle' } },
    {
      prop: 'terrainExaggeration',
      optional: true,
      label: 'Exaggeration',
      section: 'Map',
      row: { kind: 'number', min: 1, max: 4, step: 0.1, precision: 1, slider: true },
    },
    {
      prop: 'projection',
      optional: true,
      label: 'Projection',
      section: 'Map',
      help: 'Globe wraps the world into a sphere; mercator is the flat map. A mid-film switch after a basemap change still hits a MapLibre crash — see docs/features/map-contexts.md.',
      row: { kind: 'select', options: ['mercator', 'globe'] },
    },
    // A default view for blocks that are not keyframed; it is edited from the camera, not
    // typed as four numbers here.
    { prop: 'camera', label: 'Default view', custom: true, optional: true, row: { kind: 'toggle' } },
    // The flat predecessor of membership. Kept working, not offered as a new way to work.
    { prop: 'hidden', label: 'Held back', custom: true, optional: true, row: { kind: 'text' } },
    { prop: 'name', label: 'Name', custom: true, row: { kind: 'text' } },
    { prop: 'visible', label: 'Visible', custom: true, row: { kind: 'toggle' } },
    { prop: 'locked', label: 'Locked', custom: true, optional: true, row: { kind: 'toggle' } },
    { prop: 'behaviours', label: 'Behaviours', custom: true, row: { kind: 'toggle' } },
    { prop: 'id', label: 'Id', custom: true, row: { kind: 'text' } },
    { prop: 'type', label: 'Type', custom: true, row: { kind: 'text' } },
    { prop: 'parentId', label: 'Parent', custom: true, row: { kind: 'text' } },
    { prop: 'order', label: 'Order', custom: true, row: { kind: 'text' } },
  ],
};

export const cameraType: NodeTypeDef = {
  type: 'camera',
  kind: 'Camera',
  create: () => createCamera(),
  props: [
    // A shot is all four channels at one instant; the inspector edits the row, not the
    // channels, so that a keyframe can never be written into three of the four.
    { prop: 'tracks', label: 'Channels', custom: true, row: { kind: 'text' } },
    { prop: 'name', label: 'Name', custom: true, row: { kind: 'text' } },
    { prop: 'behaviours', label: 'Rig', custom: true, row: { kind: 'toggle' } },
    { prop: 'id', label: 'Id', custom: true, row: { kind: 'text' } },
    { prop: 'type', label: 'Type', custom: true, row: { kind: 'text' } },
    { prop: 'parentId', label: 'Parent', custom: true, row: { kind: 'text' } },
    { prop: 'order', label: 'Order', custom: true, row: { kind: 'text' } },
  ],
};
