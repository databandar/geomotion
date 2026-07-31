import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The dependency law, made executable.
 *
 * ENGINEERING_GUIDE §2 states it as prose: "arrows point downward only ...
 * enforced by eslint-plugin-boundaries in CI; a violated boundary fails the
 * build, no exceptions." Until this file existed, that was a promise rather than
 * a rule, and nothing stopped an engine package from importing React.
 *
 * Adding a package means adding one entry to `elements` and one row to
 * `allowed` — and deliberately deciding what it may depend on, which is the
 * point.
 */

/** Every workspace element, matched by path. Order matters: first match wins. */
const elements = [
  { type: 'core', pattern: 'packages/core/**', mode: 'full' },
  { type: 'geometry', pattern: 'packages/geometry/**', mode: 'full' },
  { type: 'document', pattern: 'packages/document/**', mode: 'full' },
  { type: 'animation', pattern: 'packages/animation/**', mode: 'full' },
  { type: 'entities', pattern: 'packages/entities/**', mode: 'full' },
  { type: 'evaluator', pattern: 'packages/evaluator/**', mode: 'full' },
  { type: 'renderer', pattern: 'packages/renderer/**', mode: 'full' },
  { type: 'map', pattern: 'packages/map/**', mode: 'full' },
  { type: 'commands', pattern: 'packages/commands/**', mode: 'full' },
  { type: 'testing', pattern: 'packages/testing/**', mode: 'full' },
  { type: 'app', pattern: 'apps/**', mode: 'full' },
];

/**
 * Who may import whom. A package absent from a row's list is forbidden from it.
 *
 * `core` has no row at all: it is the bottom of the graph and may import nothing
 * from the workspace, which is the contract that keeps it dependency-free.
 */
const allowed = [
  { from: 'geometry', allow: ['core', 'geometry'] },
  // The registry is a mechanism, not a feature: a command's `run` is a closure its
  // registrar supplies, so this needs nothing but `core`.
  { from: 'commands', allow: ['core', 'commands'] },
  { from: 'document', allow: ['core', 'document'] },
  { from: 'animation', allow: ['core', 'document', 'animation'] },
  { from: 'entities', allow: ['core', 'geometry', 'document', 'entities'] },
  /*
   * The evaluator is the one place that reads the document and produces a scene, so
   * it sits above everything except the app — and below the renderer, which it hands
   * values to rather than calling.
   */
  {
    from: 'evaluator',
    allow: ['core', 'geometry', 'document', 'entities', 'animation', 'renderer', 'map', 'evaluator'],
  },
  // The renderer takes a scene of plain values. It reaches `entities` only for the
  // region set's shape, and must never see the document.
  { from: 'renderer', allow: ['core', 'geometry', 'entities', 'renderer'] },
  // Everything that knows MapLibre exists lives in `map`, which is why the
  // compositor can stay independent of it.
  { from: 'map', allow: ['core', 'geometry', 'renderer', 'map'] },
  {
    from: 'app',
    allow: [
      'core',
      'geometry',
      'document',
      'entities',
      'animation',
      'evaluator',
      'renderer',
      'map',
      'commands',
      'app',
    ],
  },
  // Dev-only, so it may reach for anything. Nothing may reach for it: shipped
  // code importing a test harness is how a harness ends up in a bundle.
  {
    from: 'testing',
    allow: [
      'core',
      'geometry',
      'document',
      'entities',
      'animation',
      'evaluator',
      'renderer',
      'map',
      'commands',
      'testing',
    ],
  },
];

/** The published name of each element that is a workspace package. */
const packageName = {
  core: '@geomotion/core',
  geometry: '@geomotion/geometry',
  document: '@geomotion/document',
  animation: '@geomotion/animation',
  entities: '@geomotion/entities',
  evaluator: '@geomotion/evaluator',
  renderer: '@geomotion/renderer',
  map: '@geomotion/map',
  commands: '@geomotion/commands',
  testing: '@geomotion/testing',
};

/**
 * The same law again, for imports written as package names.
 *
 * This duplication is not an oversight. `element-types` only governs paths it can
 * resolve to a local file, and a workspace package is symlinked into
 * node_modules — so `import '@geomotion/geometry'` reads as third-party and the
 * rule skips it silently, enforcing nothing. (Found by deliberately committing a
 * violation and watching the lint pass.) The typescript resolver does not help,
 * because these packages export raw `.ts` from their `exports` field.
 *
 * So: `element-types` catches relative imports, `external` catches package names,
 * and both are derived from `allowed` above — edit the law in one place.
 */
const externalRules = elements
  .map(({ type }) => {
    const allow = allowed.find((r) => r.from === type)?.allow ?? [];
    const disallow = Object.entries(packageName)
      .filter(([t]) => t !== type && !allow.includes(t))
      .map(([, name]) => name);
    return {
      from: [type],
      disallow,
      message: `A '${type}' element may not depend on ${disallow.join(', ')} — see the guide §2 dependency law.`,
    };
  })
  .filter((r) => r.disallow.length > 0);

/** Engine packages run in workers and in node. Neither has a window. */
const NO_DOM = [
  { name: 'react', message: 'Engine packages must stay renderer- and framework-free (guide §2).' },
  { name: 'react-dom', message: 'Engine packages must stay renderer- and framework-free (guide §2).' },
  { name: 'maplibre-gl', message: 'Only packages/map and the apps may touch MapLibre (guide §2).' },
];

/**
 * Packages that legitimately draw.
 *
 * `renderer` composites onto a canvas and `map` drives MapLibre; a canvas renderer
 * with no canvas is not a useful abstraction. They are exempt from the DOM ban and
 * from nothing else — the dependency law still applies, and `renderer` still may not
 * import MapLibre.
 */
const DRAWS = ['packages/renderer/**', 'packages/map/**'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'apps/pipeline/out/**',
      // Plain .mjs node scripts, not part of the typed graph.
      'apps/pipeline/**/*.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': elements,

    },
    rules: {
      'boundaries/element-types': ['error', { default: 'disallow', rules: allowed }],
      'boundaries/external': ['error', { default: 'allow', rules: externalRules }],
      // Unused args prefixed with _ are a deliberate signature, not an oversight.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['packages/**/*.ts'],
    ignores: ['packages/testing/**', ...DRAWS],
    rules: {
      'no-restricted-imports': ['error', { paths: NO_DOM }],
      // §2 forbids these packages from depending on the DOM. Imports were already
      // covered; these are the globals that sneak past an import check — which is
      // exactly how localStorage ended up inside v1's document model.
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'fetch'].map((name) => ({
          name,
          message: 'Engine packages must run in a worker and in node; the app owns browser APIs (guide §2).',
        })),
      ],
      // A silent catch is how the v1 export bug stayed hidden for a week: the
      // renderer was throwing on every frame and nothing said so.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },

  {
    // The app already carried `eslint-disable react-hooks/exhaustive-deps`
    // comments at five call sites before this plugin was installed — meaning the
    // dependency arrays had never actually been checked. They are checked now.
    files: ['apps/studio/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  {
    /*
     * The drawing packages may use the DOM. A canvas compositor with no canvas is not
     * a useful abstraction, and MapLibre is a DOM library.
     *
     * They are exempt from that ban and nothing else: the dependency law still holds,
     * and `renderer` still may not know MapLibre exists. That separation is the whole
     * reason `map` is a separate package — one surface paints pixels, the other drapes
     * geometry onto a map, and they can be reasoned about, and eventually moved to a
     * worker, independently.
     *
     * One block per package, because a later block replaces a rule rather than
     * merging with it: two blocks both setting `no-restricted-imports` would silently
     * drop whichever came first.
     */
    files: ['packages/renderer/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'maplibre-gl', message: 'Only packages/map and the apps may touch MapLibre (guide §2).' },
            { name: 'react', message: 'The renderer must stay framework-free (guide §2).' },
            { name: '@geomotion/document', message: 'The renderer draws a scene, never the document.' },
          ],
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },

  {
    files: ['packages/map/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'The map package must stay framework-free (guide §2).' },
            { name: '@geomotion/document', message: 'The map drapes a scene, never the document.' },
          ],
        },
      ],
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },

  {
    // The harness straddles two runtimes: the CLI runs in node, and the capture
    // functions are serialised into the page, so both sets of globals are real.
    files: ['packages/testing/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },

  {
    // Tests may reach for anything; they are not shipped.
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { 'boundaries/element-types': 'off' },
  },
);
