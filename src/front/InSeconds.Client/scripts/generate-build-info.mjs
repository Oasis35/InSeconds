import { writeFileSync } from 'node:fs';
const ts = process.env['BUILD_TIME'] || new Date().toISOString();
writeFileSync(
  'src/app/core/build-info.ts',
  `export const BUILD_TIME: string = '${ts}';\n`
);
