import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const seed = process.argv.includes('--seed');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // Runtime deps stay external and are installed from package.json at deploy time;
  // @tms/shared is bundled in so Cloud Functions never needs the workspace symlink.
  external: ['firebase-admin', 'firebase-functions', 'express', 'cors', 'busboy', 'zod'],
};

const targets = seed
  ? [{ entryPoints: ['src/seed.ts'], outfile: 'lib/seed.js' }]
  : [{ entryPoints: ['src/index.ts'], outfile: 'lib/index.js' }];

for (const t of targets) {
  const opts = { ...common, ...t };
  if (watch) {
    const ctx = await context(opts);
    await ctx.watch();
    console.log(`[esbuild] watching ${t.entryPoints[0]}`);
  } else {
    await build(opts);
  }
}
