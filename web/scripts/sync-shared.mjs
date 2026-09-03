// Copies packages/shared/src into web/src/shared so the web app is self-contained for
// Firebase App Hosting (which builds `web/` in isolation) and for Turbopack, whose root is `web/`.
// Runs automatically before dev/build/typecheck/lint (see package.json "pre*" scripts).
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'packages', 'shared', 'src');
const dest = join(here, '..', 'src', 'shared');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
let count = 0;
for (const name of readdirSync(src)) {
  if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
  if (!statSync(join(src, name)).isFile()) continue;
  cpSync(join(src, name), join(dest, name));
  count++;
}
console.log(`[sync-shared] copied ${count} files from packages/shared/src → web/src/shared`);
