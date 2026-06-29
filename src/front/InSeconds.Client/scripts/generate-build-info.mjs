import { writeFileSync } from 'node:fs';
const ts = new Date().toISOString();
writeFileSync(
  'src/app/core/build-info.ts',
  `export const BUILD_TIME: string = '${ts}';\n`
);
