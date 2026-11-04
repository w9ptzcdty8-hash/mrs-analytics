import {readFileSync,writeFileSync} from 'node:fs';
const source = readFileSync(new URL('../client/analytics.js', import.meta.url), 'utf8');
writeFileSync(new URL('../src/client-source.js', import.meta.url),
  '// Generated from client/analytics.js. Run node scripts/sync-client.mjs after edits.\\n'.replace('\\n','\n') +
  'export const clientSource = ' + JSON.stringify(source) + ';\n');
