/**
 * Password strength for the 4-step meter (team design). Our minimum is 12 characters (same rule as the API),
 * so anything shorter is level 1 whatever it contains. The meter is a hint; the server decides what is accepted.
 */
export const MIN_PASSWORD_LENGTH = 12;
const LABELS = ['Enter a password', 'Weak', 'Fair', 'Good', 'Strong'] as const;

export function passwordLevel(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  if (password.length < MIN_PASSWORD_LENGTH) return 1;
  let score = 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4) as 1 | 2 | 3 | 4;
}

export function passwordHint(password: string): string {
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    const left = MIN_PASSWORD_LENGTH - password.length;
    return `Weak · ${left} more character${left === 1 ? '' : 's'} to reach ${MIN_PASSWORD_LENGTH}`;
  }
  return LABELS[passwordLevel(password)];
}
