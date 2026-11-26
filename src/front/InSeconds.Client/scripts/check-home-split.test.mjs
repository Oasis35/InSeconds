// Tests de la garde `check-home-split.mjs` : `node --test scripts/check-home-split.test.mjs`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { violationsIn } from './check-home-split.mjs';

test('un import multi-lignes de la manche est vu', () => {
  const source = "import {\n  DailyRoundStore,\n  RoundExit,\n} from '../data-access/daily-round.store';\n";
  assert.equal(violationsIn(source).length, 1);
});

test('shared-audio est permis, pas un fichier qui commence par ce nom', () => {
  assert.equal(violationsIn("import { unlockSharedAudio } from '../../gameplay/data-access/shared-audio';").length, 0);
  assert.equal(violationsIn("import { x } from '../../gameplay/data-access/shared-audio-plus';").length, 1);
});

test("le lecteur, la manche et l'import dynamique", () => {
  assert.equal(violationsIn("import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';").length, 1);
  assert.equal(violationsIn("const load = () => import('./daily-round.routes');").length, 0);
});
