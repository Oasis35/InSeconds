import { normalizePseudo, pseudoIssue } from './pseudo';

describe('pseudoIssue', () => {
  it.each(['Clément', 'Alice_E2E', 'a.b-c d', 'abc', 'x'.repeat(20), '  Bob  '])('accepte « %s »', pseudo => {
    expect(pseudoIssue(pseudo)).toBeNull();
  });

  it('exige une saisie', () => {
    expect(pseudoIssue('')).toBe('required');
    expect(pseudoIssue('    ')).toBe('required');
  });

  it('refuse moins de trois caractères, espaces autour compris', () => {
    expect(pseudoIssue('ab')).toBe('tooShort');
    expect(pseudoIssue('  ab  ')).toBe('tooShort');
  });

  it('refuse plus de vingt caractères', () => {
    expect(pseudoIssue('x'.repeat(21))).toBe('tooLong');
  });

  it.each(['Bob<script>', 'a@b.fr', 'smile😀', 'tab\tulation'])('refuse les caractères hors liste : « %s »', pseudo => {
    expect(pseudoIssue(pseudo)).toBe('invalid');
  });

  it('normalise en retirant les espaces autour', () => {
    expect(normalizePseudo('  Bob ')).toBe('Bob');
  });
});
