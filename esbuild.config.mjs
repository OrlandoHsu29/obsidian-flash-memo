import { build } from 'esbuild';
await build({entryPoints:['src/main.ts'],bundle:true,external:['obsidian','electron'],platform:'node',format:'cjs',target:'es2020',outfile:'main.js',minify:true,logLevel:'info'});
