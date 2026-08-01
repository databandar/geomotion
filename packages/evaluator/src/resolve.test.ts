import { describe, expect, it } from 'vitest';
import { createLayer, keyframedTrack, staticTrack, trackPropsOf } from '@geomotion/document';
import type { Layer } from '@geomotion/document';
import { resolveTracks } from './resolve.ts';

/**
 * The one pass that turns tracks into values (docs/features/every-property-a-track.md).
 *
 * §04's `value(t) = behaviors(expr(base(t)))` is "one pipeline, whole app". These tests are
 * the "whole app" half: not that a track evaluates — `@geomotion/animation` proves that —
 * but that **every declared track on every type** is resolved, by the registry, without any
 * of them being named here.
 */

const TYPES = ['route', 'marker', 'text', 'shape', 'regions', 'clouds', 'image'] as const;

const read = (node: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), node);

describe('resolveTracks', () => {
  it.each(TYPES)('leaves no track unresolved on a fresh %s', (type) => {
    /*
     * The failure this exists for is silent and local: a property that is a track in the
     * document and reaches the renderer unresolved draws as `NaN`, at one layer, at one
     * time. Asserting over the registry rather than a list here means a property added
     * tomorrow is covered without anyone remembering to add it.
     */
    const resolved = resolveTracks(createLayer(type, 0), 0);
    for (const path of trackPropsOf(type)) {
      expect(typeof read(resolved, path), `${type}.${path}`).toBe('number');
    }
  });

  it('resolves a nested path without flattening the object around it', () => {
    // Route's marker is read whole by the renderer; resolving `marker.size` must not lose
    // the icon or the colour beside it.
    const route = createLayer('route', 0) as Extract<Layer, { type: 'route' }>;
    const resolved = resolveTracks(route, 0);
    expect(resolved.marker.size).toBe(6);
    expect(resolved.marker.icon).toBe('dot');
    expect(resolved.marker.color).toBe('#ffffff');
    expect(resolved.follow.faceHeading).toBe(true);
  });

  it('reads a keyframed property at the time it is asked for', () => {
    const text = {
      ...(createLayer('text', 0) as Extract<Layer, { type: 'text' }>),
      size: keyframedTrack([
        { id: 'a', t: 0, value: 20, easing: 'linear' },
        { id: 'b', t: 10, value: 120, easing: 'linear' },
      ]),
    };
    expect(resolveTracks(text, 0).size).toBe(20);
    expect(resolveTracks(text, 5).size).toBe(70);
    expect(resolveTracks(text, 10).size).toBe(120);
  });

  it('falls back to the type default, not to zero, when a binding cannot resolve', () => {
    /*
     * Zero is a real and wrong value here. A cloud whose `scale` binding is broken would
     * render at scale 0 — invisible, and indistinguishable from a cloud that is simply not
     * on screen yet. The type's own default is the honest answer to "we could not read it".
     */
    const clouds = {
      ...(createLayer('clouds', 0) as Extract<Layer, { type: 'clouds' }>),
      scale: { kind: 'bound' as const, ref: 'geo:nope', path: 'x' },
    };
    const resolved = resolveTracks(clouds, 0, { facts: () => undefined });
    expect(resolved.scale).toBe(1.15);
  });

  it('never touches the document it was handed', () => {
    // §00's time-source bug in miniature: a render that edits what it is rendering.
    const text = createLayer('text', 0) as Extract<Layer, { type: 'text' }>;
    const before = JSON.stringify(text);
    resolveTracks(text, 3);
    expect(JSON.stringify(text)).toBe(before);
  });

  it('is deterministic — the same time gives the same values', () => {
    const route = createLayer('route', 0);
    expect(resolveTracks(route, 2.5)).toEqual(resolveTracks(route, 2.5));
  });

  it('leaves a plain value alone, so an older document still draws', () => {
    // A file written before a property became a track, or one a plugin wrote loosely.
    const loose = { ...(createLayer('image', 0) as Extract<Layer, { type: 'image' }>), opacity: 0.5 as never };
    expect(resolveTracks(loose, 0).opacity).toBe(0.5);
  });

  it('returns a node type it has never heard of untouched', () => {
    const alien = { id: 'z', type: 'hologram', glitter: staticTrack(3) } as unknown as Layer;
    expect(resolveTracks(alien, 0)).toBe(alien);
  });
});
