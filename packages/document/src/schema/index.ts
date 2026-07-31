/**
 * The registry, populated.
 *
 * Importing this module registers every node type this build ships. It is imported by
 * `project.ts`, which is on every path that constructs or loads a document — so by the time
 * anything can ask "what is a `regions` layer", the answer is there. A registry that had to
 * be initialised by the caller would work until one caller forgot.
 */
import { registerNodeType } from './meta.ts';
import { LAYER_TYPES } from './layers.ts';
import { cameraType, groupType } from './containers.ts';

for (const def of Object.values(LAYER_TYPES)) registerNodeType(def);
registerNodeType(groupType);
registerNodeType(cameraType);

export { defaultTour, layerBase, LAYER_TYPES } from './layers.ts';
export { createGroup, cameraType, groupType } from './containers.ts';
export {
  createNode,
  nodeTypeDef,
  nodeTypes,
  propsOf,
  registerNodeType,
  type NodeTypeDef,
  type PropertyMeta,
  type PropertyRow,
} from './meta.ts';
