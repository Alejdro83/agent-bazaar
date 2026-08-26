/**
 * Fixes a real, verified runtime break in `@bnbagent/sdk`'s Altana wallet
 * provider when loaded from a Next.js (webpack-bundled) server route,
 * rather than `tsx` (no bundler).
 *
 * `@altananetwork/sdk` is an ESM-only "optional peer" the SDK loads via a
 * runtime `import(ALTANA_SDK_PACKAGE)` where `ALTANA_SDK_PACKAGE` is a
 * *variable*, not a string literal — see
 * `node_modules/@bnbagent/sdk/dist/chunk-*.js`'s sdkLoader. Webpack cannot
 * statically resolve a variable import specifier into its build graph (the
 * "Critical dependency: the request of a dependency is an expression"
 * warning at build time is this exact thing, and is otherwise harmless) —
 * but at RUNTIME, inside a Next.js route, that unresolved specifier throws
 * webpack's own module-not-found error, which the SDK's loader misreads as
 * "package not installed" (its `isModuleNotFound()` check matches on
 * message shape, not on whether the package is genuinely absent).
 *
 * Verified: `@altananetwork/sdk` genuinely IS installed
 * (`node -e "require.resolve('@altananetwork/sdk')"` finds it — it only
 * fails to `require()` because it's ESM-only, unrelated to this bug), and
 * `scripts/altana-demo-swap.ts` run via `tsx` (no bundler) never hits this
 * — it reaches the real "insufficient BNB testnet balance" error instead.
 * Confirmed via `POST /api/altana/grant`, which — before this fix — failed
 * with "requires the optional peer dependency '@altananetwork/sdk' (not
 * installed)" despite the package being present.
 *
 * `setAltanaSdkImporter` is the SDK's own documented escape hatch for a
 * host-specific import mechanism (its docstring: "Hosts such as a globally
 * installed CLI use this seam to resolve the optional, ESM-only
 * `@altananetwork/sdk` ..."). The `new Function` indirection below builds
 * the `import(...)` call from a string AT RUNTIME so no bundler's static
 * analyzer ever sees a literal dynamic-import expression to (mis)handle —
 * a standard, widely-used technique for exactly this "ESM-only optional
 * dependency inside a bundler" situation.
 *
 * Side-effect-only module — every entry point that can transitively reach
 * an Altana call (`src/lib/altana/index.ts` and
 * `src/lib/altana/session-envelope.ts`) imports this for its side effect,
 * since either can be the first Altana code a fresh server instance runs.
 */

import { setAltanaSdkImporter } from '@bnbagent/sdk/wallets';

const nativeDynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<unknown>;

setAltanaSdkImporter(() => nativeDynamicImport('@altananetwork/sdk'));
