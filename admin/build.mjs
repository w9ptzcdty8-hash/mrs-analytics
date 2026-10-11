import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
await build({entryPoints:['admin/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'admin/.build/worker.mjs',minify:true,plugins:[{name:'text-assets',setup(b){
  b.onResolve({filter:/\?text$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-5)),namespace:'text-assets'}));
  b.onLoad({filter:/.*/,namespace:'text-assets'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));
}}]});
