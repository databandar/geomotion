/**
 * Thin client for the Studio dev-server middleware. Every call that needs a
 * secret, the filesystem, or a subprocess goes through here — the browser never
 * holds the OpenRouter key.
 */

export interface Health {
  openrouter: boolean;
  textModel: string;
  imageModel: string;
  voicebox: boolean;
  voiceboxUrl: string;
  ffmpeg: boolean;
  nfhs: number;
}

export interface Extracted {
  indicator: string;
  round: string;
  values: Record<string, number>;
  previous: Record<string, number>;
  national: number | null;
  nationalPrevious: number | null;
  missing: string[];
  ranked: [string, number][];
  movers: { name: string; then: number; now: number; delta: number }[];
}

export interface TourStop {
  region: string;
  say: string;
  caption?: string | undefined;
  image?: string | undefined;
}

export interface Beat {
  kind: 'hook' | 'clouds' | 'outline' | 'overview' | 'tour' | 'ranking' | 'labels';
  id?: string;
  say?: string | undefined;
  onScreen?: string | undefined;
  stops?: TourStop[] | undefined;
  top?: number;
  heading?: string | undefined;
  labelAll?: boolean;
  pad?: number;
  minLength?: number;
  stopPad?: number;
  minStop?: number;
}

export interface VoiceConfig {
  engine: 'voicebox' | 'say' | 'elevenlabs' | 'google' | 'http';
  vbEngine?: string | undefined;
  presetVoice?: string | undefined;
  profileName?: string | undefined;
  profileId?: string | undefined;
  language?: string | undefined;
  voice?: string | undefined;
  rate?: number | undefined;
}

export interface StudioScript {
  /** shared look for generated stop illustrations */
  imageStyle?: string;
  title: string;
  slug: string;
  format: 'landscape' | 'short' | 'square';
  fps: number;
  basemap: string;
  dataset: string;
  terrain: boolean;
  values: unknown;
  ramp: string;
  flipRamp: boolean | null;
  credit: string;
  voice: VoiceConfig;
  metric: { label: string; unit: string; decimals: number; legend?: string };
  zoom?: number;
  padding?: number;
  pitch?: number;
  flyTime?: number;
  cameraBow?: number;
  beatGap?: number;
  tailOut?: number;
  beats: Beat[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path}: server returned non-JSON (${text.slice(0, 120)})`);
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `${path} failed (${res.status})`);
  return body as T;
}

export const api = {
  health: () => call<Health>('/health'),

  indicators: () => call<{ indicators: string[] }>('/data/indicators'),

  extract: (indicator: string, round = 'total') =>
    call<Extracted>('/data/extract', { method: 'POST', body: JSON.stringify({ indicator, round }) }),

  regions: (dataset: string) => call<{ regions: string[] }>(`/data/regions?dataset=${encodeURIComponent(dataset)}`),

  writeScript: (input: Record<string, unknown>) =>
    call<{ beats: Beat[]; dropped: string[]; shortfall: string | null; usage: unknown; model: string }>('/llm/script', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  image: (input: { slug: string; region: string; prompt?: string | undefined; style?: string | undefined }) =>
    call<{ url?: string; path?: string; dataUrl?: string; prompt: string }>('/llm/image', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  assets: (slug: string) =>
    call<{ slug: string; images: { region: string; url: string }[] }>(`/assets?slug=${encodeURIComponent(slug)}`),

  deleteAsset: (slug: string, region: string) =>
    call<{ ok: boolean }>('/assets/delete', { method: 'POST', body: JSON.stringify({ slug, region }) }),

  voices: (engine: string) =>
    call<{
      presets: { voice_id: string; name: string; gender: string; language: string }[];
      profiles: { id: string; name: string; language: string; voice_type: string }[];
    }>(`/voice/voices?engine=${encodeURIComponent(engine)}`),

  referenceText: () => call<{ text: string }>('/voice/reference'),

  clone: (input: { name: string; language: string; engine: string; sampleBase64: string; filename: string; referenceText: string }) =>
    call<{ profile: { id: string; name: string } }>('/voice/clone', { method: 'POST', body: JSON.stringify(input) }),

  narrate: (script: StudioScript) =>
    call<{
      lines: { key: string; text: string; duration?: number; cached?: boolean; manual?: boolean; url?: string; error?: string }[];
      total: number;
    }>(
      '/voice/narrate',
      { method: 'POST', body: JSON.stringify({ script }) },
    ),

  compose: (script: StudioScript) =>
    call<{ project: unknown; beats: { kind: string; start: number; length: number }[]; duration: number; missing: string[]; unresolved: string[] }>(
      '/compose',
      { method: 'POST', body: JSON.stringify({ script }) },
    ),

  render: (script: StudioScript, draft: boolean) =>
    call<{ started: boolean; slug: string }>('/render', { method: 'POST', body: JSON.stringify({ script, draft }) }),

  renderProject: (project: unknown, slug: string, draft: boolean) =>
    call<{ started: boolean; slug: string }>('/render/project', {
      method: 'POST',
      body: JSON.stringify({ project, slug, draft }),
    }),

  cancelRender: () => call<{ ok: boolean }>('/render/cancel', { method: 'POST' }),

  saveRecording: (slug: string, key: string, audioBase64: string) =>
    call<{ ok: boolean; duration: number; url: string }>('/voice/record', {
      method: 'POST',
      body: JSON.stringify({ slug, key, audioBase64 }),
    }),

  clearRecording: (slug: string, key: string) =>
    call<{ ok: boolean }>('/voice/record/clear', { method: 'POST', body: JSON.stringify({ slug, key }) }),

  manualLines: (slug: string) => call<{ keys: string[] }>(`/voice/manual?slug=${encodeURIComponent(slug)}`),
};

/** Live render log. Returns an unsubscribe function. */
export function watchRender(
  onLines: (lines: string[]) => void,
  onDone: (info: { exit: number; output: string }) => void,
): () => void {
  const es = new EventSource('/api/render/log');
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data) as { lines?: string[]; done?: boolean; exit?: number; output?: string };
    if (msg.lines?.length) onLines(msg.lines);
    if (msg.done) {
      onDone({ exit: msg.exit ?? 0, output: msg.output ?? '' });
      es.close();
    }
  };
  es.onerror = () => es.close();
  return () => es.close();
}
