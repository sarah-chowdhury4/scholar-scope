/**
 * Give or take away the admin role. This is how the FIRST admin is made ("bootstrapping"); after that, admins
 * can manage roles from the admin dashboard. The role is a Firebase custom claim, so only someone who can run
 * this script (server access) or an existing admin can set it. A student can never give it to themselves.
 *
 *   docker compose exec api npm run admin -- grant  someone@example.com
 *   docker compose exec api npm run admin -- revoke someone@example.com
 *   docker compose exec api npm run admin -- list
 *
 * (From the repo root, `npm run admin -- grant someone@example.com` runs the same thing.)
 * After a grant, the person signs out and in again (or reloads) to see the Admin page.
 */
import { assertSafeEnvironment } from '@scholarscope/shared';

assertSafeEnvironment();
const { auth, writeAudit } = await import('@scholarscope/shared');

const [command, email] = process.argv.slice(2);

async function setAdmin(address: string, admin: boolean) {
  const user = await auth()
    .getUserByEmail(address)
    .catch(() => null);
  if (!user) {
    console.error(`No account uses ${address}. The person must sign up first.`);
    process.exit(1);
  }
  await auth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin });
  if (!admin) await auth().revokeRefreshTokens(user.uid);
  await writeAudit({
    actor: { type: 'system', id: 'admin-script' },
    subjectUid: user.uid,
    action: admin ? 'admin.role.granted' : 'admin.role.removed',
    resource: `users/${user.uid}`,
    after: { admin },
  });
  console.log(admin ? `${address} is now an admin. They should sign out and in again.` : `${address} is no longer an admin.`);
}

if ((command === 'grant' || command === 'revoke') && email) {
  await setAdmin(email.trim(), command === 'grant');
} else if (command === 'list') {
  const admins: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth().listUsers(1000, pageToken);
    admins.push(...page.users.filter((u) => u.customClaims?.admin === true).map((u) => u.email ?? u.uid));
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(admins.length ? `Admins:\n  ${admins.join('\n  ')}` : 'No admins yet. Make one with: npm run admin -- grant you@example.com');
} else {
  console.error('Usage: npm run admin -- grant <email> | revoke <email> | list');
  process.exit(1);
}
process.exit(0);
