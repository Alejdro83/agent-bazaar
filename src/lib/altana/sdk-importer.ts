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

// A literal specifier (not the `new Function(...)` indirection this used
// initially) — that first version hid the import from webpack's static
// analysis to dodge a build warning, but it ALSO hid it from Vercel's own
// file-tracing (@vercel/nft), which decides what node_modules files ship in
// each serverless function's bundle by statically finding require/import
// calls. Result: it built and deployed fine, but Vercel deduplicated the
// Altana routes' functions with an unrelated route that happens to produce
// an identical *visible* dependency graph, so @altananetwork/sdk's files
// never actually shipped — confirmed by inspecting `vercel build`'s real
// output (`.vercel/output/functions/api/altana/grant.func` was a symlink to
// `agents/[id].func`, which has zero files from this package). A literal
// specifier here is statically visible to both webpack and Vercel's
// tracing, so this route's dependency graph is now genuinely distinct.
setAltanaSdkImporter(() => import('@altananetwork/sdk'));
