import type { StudioScript } from './api';

export const defaultScript: StudioScript = {
  title: 'Untitled',
  imageStyle: 'flat editorial vector illustration, limited muted palette, simple geometric shapes, subtle grain, dark background',
  slug: 'studio',
  format: 'short',
  fps: 30,
  basemap: 'satellite',
  dataset: 'india-official',
  terrain: true,
  values: { nfhs: 'Women age 20-24 years married before age 18 years (%)', round: 'total' },
  ramp: 'crimson',
  flipRamp: false,
  credit: 'Data: NFHS-6 · Boundaries: Govt. of India depiction · Imagery: Esri',
  voice: {
    engine: 'voicebox',
    vbEngine: 'kokoro',
    presetVoice: 'hf_alpha',
    language: 'hi',
    profileName: 'GeoMotion Hindi (hf_alpha)',
  },
  metric: { label: 'Women 20–24 married before 18', unit: '%', decimals: 1, legend: 'Married before 18 (%)' },
  zoom: 3.9,
  padding: 0.13,
  pitch: 34,
  flyTime: 0.7,
  cameraBow: 0.4,
  beatGap: 0.18,
  tailOut: 1,
  beats: [
    { kind: 'hook', id: 'hook', say: '', onScreen: '', minLength: 2.6, pad: 0.4 },
    { kind: 'overview', id: 'setup', say: '', onScreen: 'Darker = higher', pad: 0.35 },
    { kind: 'tour', id: 'tour', stopPad: 0.4, minStop: 2, stops: [] },
    { kind: 'ranking', id: 'board', top: 5, heading: 'TOP 5 HIGHEST', say: '', pad: 0.8, minLength: 2.6 },
    { kind: 'labels', id: 'close', labelAll: true, say: '', pad: 0.9 },
  ],
};

export const BEAT_HELP: Record<string, string> = {
  hook: 'Cold open on the finished map with a big title. The first second decides whether they stay.',
  clouds: 'Cloud cover that parts to reveal the map. Use instead of a hook for a slower open.',
  outline: 'The national boundary traces itself on.',
  overview: 'The whole choropleth, borders drawing on.',
  tour: 'One region per stop: camera flies in, border traces, value counts up.',
  ranking: 'A Top-N leaderboard card.',
  labels: 'Camera pulls back; every region labelled with its value.',
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'studio';
