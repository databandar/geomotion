import { describe, expect, it } from 'vitest';
import {
  addNode,
  createGroup,
  createLayer,
  keyframedTrack,
  layersOf,
  projectWith,
  setNodeParent,
  staticTrack,
  transact,
  type GroupNode,
  type Project,
  type TextLayer,
} from '@geomotion/document';
import { evaluate } from './scene.ts';

/**
 * A group multiplies into everything under it (docs/features/groups.md, ARCHITECTURE §04).
 *
 * These pin the inheritance itself rather than the picture: the alpha a layer ends up with
 * is what the renderer draws by, and it is the one number a group actually changes.
 */

/** A text layer on screen for the whole composition, so alpha is the only variable. */
const text = (name: string) =>
  createLayer('text', 0, { name, out: 30, fade: 0 } as Partial<TextLayer>) as TextLayer;

/** Nest `layers` under a fresh group and hand both back. */
function grouped(patch: Partial<GroupNode> = {}, count = 1) {
  const layers = Array.from({ length: count }, (_, i) => text(`Text ${i + 1}`));
  const group = { ...createGroup('Beat'), ...patch } as GroupNode;
  const project = transact(projectWith([group, ...layers]), (d) => {
    for (const l of layers) setNodeParent(d, l.id, group.id);
  }).next;
  return { project, group, layers };
}

/*
 * Looked up by id, not by name: the renderer never sees document metadata (§1.6), so a
 * `TextStyle` carries no layer name — which is the boundary working as intended.
 */
const alphaOf = (project: Project, layer: { id: string }, t = 5) =>
  evaluate(project, t).texts.find((x) => x.style.id === layer.id)?.alpha;

describe('a group multiplies into its subtree', () => {
  it('leaves a layer alone at full opacity', () => {
    const { project, layers } = grouped();
    expect(alphaOf(project, layers[0]!)).toBe(1);
  });

  it('dims every child by its opacity', () => {
    const { project, layers } = grouped({ opacity: staticTrack(0.4) }, 2);
    expect(alphaOf(project, layers[0]!)).toBeCloseTo(0.4, 6);
    expect(alphaOf(project, layers[1]!)).toBeCloseTo(0.4, 6);
  });

  it('hides the whole subtree when the group is hidden', () => {
    // The child's own `visible` is untouched — this is inheritance, not a rewrite.
    const { project, layers } = grouped({ visible: false }, 2);
    expect(alphaOf(project, layers[0]!)).toBe(0);
    expect(layersOf(project).find((l) => l.id === layers[0]!.id)?.visible).toBe(true);
  });

  it('compounds through two levels, which is what inheritance means', () => {
    const outer = { ...createGroup('Outer'), opacity: staticTrack(0.5) } as GroupNode;
    const inner = { ...createGroup('Inner'), opacity: staticTrack(0.5) } as GroupNode;
    const layer = text('Deep');
    const project = transact(projectWith([outer, inner, layer]), (d) => {
      setNodeParent(d, inner.id, outer.id);
      setNodeParent(d, layer.id, inner.id);
    }).next;

    expect(alphaOf(project, layer)).toBeCloseTo(0.25, 6);
  });

  it('ramps its children when the opacity is keyframed', () => {
    const { project, layers } = grouped({
      opacity: keyframedTrack([
        { id: 'a', t: 0, value: 0, easing: 'linear' },
        { id: 'b', t: 10, value: 1, easing: 'linear' },
      ]),
    });
    expect(alphaOf(project, layers[0]!, 0)).toBeCloseTo(0, 6);
    expect(alphaOf(project, layers[0]!, 5)).toBeCloseTo(0.5, 6);
    expect(alphaOf(project, layers[0]!, 10)).toBeCloseTo(1, 6);
  });

  it('still applies the layer\'s own fade underneath', () => {
    // Inheritance multiplies; it does not replace. A layer half-way through its fade-in
    // inside a half-dimmed group is at a quarter.
    const group = { ...createGroup('Beat'), opacity: staticTrack(0.5) } as GroupNode;
    const layer = createLayer('text', 0, { name: 'Fading', out: 10, fade: 2 } as Partial<TextLayer>) as TextLayer;
    const project = transact(projectWith([group, layer]), (d) => setNodeParent(d, layer.id, group.id)).next;

    expect(alphaOf(project, layer, 1)).toBeCloseTo(0.25, 6);
  });

  it('changes nothing for a project with no groups', () => {
    const alone = text('Alone');
    expect(alphaOf(projectWith([alone]), alone)).toBe(1);
  });
});

describe('draw order through groups', () => {
  it('is depth-first: a group draws where it sits, children in their own order', () => {
    // §6.5: "depth-first document order". The group is added between two root layers, so
    // its children must appear between them and not at either end.
    const bottom = text('Bottom');
    const top = text('Top');
    const group = createGroup('Middle');
    const inner1 = text('Inner 1');
    const inner2 = text('Inner 2');

    const project = transact(projectWith([bottom, group, top]), (d) => {
      addNode(d, inner1, { parentId: group.id });
      addNode(d, inner2, { parentId: group.id });
    }).next;

    expect(layersOf(project).map((l) => l.name)).toEqual(['Bottom', 'Inner 1', 'Inner 2', 'Top']);
  });

  it('draws a layer whose parent has vanished rather than losing it', () => {
    // Reachable through a hand-edited file or a patch that landed out of order. Visibly in
    // the wrong place beats invisibly absent — a layer that silently stops rendering is the
    // hardest kind of bug to notice in a finished video.
    const orphan = text('Orphan');
    const project = transact(projectWith([text('Kept'), orphan]), (d) => {
      const node = d.nodes[orphan.id];
      if (node) node.parentId = 'nd_gone';
    }).next;

    expect(layersOf(project).map((l) => l.name)).toEqual(['Kept', 'Orphan']);
  });
});
