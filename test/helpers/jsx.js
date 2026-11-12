// Load a .jsx (or extensionless-import) app module in node --test. esbuild ships
// with Vite; the bundle is written under node_modules/.cache so bare imports such
// as "react" resolve to the app's single copy.
import {build} from 'esbuild';
import {mkdirSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = `${root}node_modules/.cache/boredone-tests`;
let n = 0;
export async function loadModule(relative) {
  mkdirSync(outDir, {recursive: true});
  const outfile = `${outDir}/${relative.replace(/[^\w]/g, '_')}-${process.pid}-${n++}.mjs`;
  await build({entryPoints: [`${root}${relative}`], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile, logLevel: 'silent'});
  return import(pathToFileURL(outfile).href);
}
