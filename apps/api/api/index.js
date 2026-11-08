/**
 * The Vercel entry point for the API.
 *
 * It is a one-line re-export, and it is JavaScript rather than TypeScript on
 * purpose. Vercel compiles a function's TypeScript with esbuild, and esbuild
 * does not emit `emitDecoratorMetadata` — the parameter types Nest's injector
 * reads to know what to construct. Compiled that way, every injected
 * dependency arrives as `undefined` and the application fails at runtime with
 * errors that point nowhere near the cause. (The same trap cost a day with
 * `tsx` during development; see the dev script in package.json.)
 *
 * So the application is compiled ahead of this by `tsc`, which does emit that
 * metadata, and this file only points at the output.
 */
export { default } from '../dist/serverless.js';
