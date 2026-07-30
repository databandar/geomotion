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
  { from: 'document', allow: ['core', 'document'] },
  { from: 'app', allow: ['core', 'geometry', 'document', 'app'] },
  // Dev-only, so it may reach for anything. Nothing may reach for it: shipped
  // code importing a test harness is how a harness ends up in a bundle.
  { from: 'testing', allow: ['core', 'geometry', 'document', 'testing'] },
];

/** The published name of each element that is a workspace package. */
const packageName = {
  core: '@geomotion/core',
  geometry: '@geomotion/geometry',
  document: '@geomotion/document',
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
    ignores: ['packages/testing/**'],
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
    // The renderer is document-free as of M8, and this is what keeps it that way.
    // It reads only the style interfaces in render/styles.ts, so a new draw
    // routine cannot quietly start depending on document state the evaluator did
    // not mean to expose. These files are the future `packages/renderer` and
    // `packages/map`; the import ban is the boundary law applied early.
    files: ['apps/studio/src/lib/overlay.ts', 'apps/studio/src/lib/mapsync.ts', 'apps/studio/src/render/styles.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@geomotion/document',
              message:
                'The renderer must not depend on the document. Add the field to render/styles.ts instead — deliberately.',
            },
          ],
        },
      ],
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
