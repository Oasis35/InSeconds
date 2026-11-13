import { formatOrdinal } from './ordinal';

describe('formatOrdinal', () => {
  it('en français : 1er puis Ne', () => {
    expect([1, 2, 11, 14, 21].map(n => formatOrdinal(n, 'fr'))).toEqual(['1er', '2e', '11e', '14e', '21e']);
  });

  it('en anglais : st, nd, rd, th', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(n => formatOrdinal(n, 'en'))).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd'],
    );
  });
});
