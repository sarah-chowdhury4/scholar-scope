import { passwordHint, passwordLevel } from './password-strength';

describe('passwordLevel', () => {
  it('keeps short passwords weak whatever they contain', () => {
    expect(passwordLevel('')).toBe(0);
    expect(passwordLevel('Ab1!')).toBe(1);
    expect(passwordHint('Ab1!')).toContain('8 more characters');
  });

  it('rises with mixed case, digits and symbols once long enough', () => {
    expect(passwordLevel('abcdefghijkl')).toBe(1);
    expect(passwordLevel('abcdefGHIJKL')).toBe(2);
    expect(passwordLevel('abcdefGHIJK1')).toBe(3);
    expect(passwordLevel('abcdefGHIJ1!')).toBe(4);
    expect(passwordHint('abcdefGHIJ1!')).toBe('Strong');
  });
});
