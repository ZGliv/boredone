// Load a .jsx (or extensionless-import) app module in node --test. esbuild is a
// devDependency pinned to the version Vite uses; the bundle is written under
// node_modules/.cache so bare imports such as "react" resolve to the app's
// single copy, and deleted once loaded so runs do not pile up files.
import {build} from 'esbuild';
import {mkdirSync, rmSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = `${root}node_modules/.cache/boredone-tests`;
let n = 0;
export async function loadModule(relative) {
  mkdirSync(outDir, {recursive: true});
  const outfile = `${outDir}/${relative.replace(/[^\w]/g, '_')}-${process.pid}-${n++}.mjs`;
  await build({entryPoints: [`${root}${relative}`], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile, logLevel: 'silent'});
  try { return await import(pathToFileURL(outfile).href); }
  finally { rmSync(outfile, {force: true}); }
}
