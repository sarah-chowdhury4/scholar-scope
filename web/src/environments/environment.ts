/**
 * Production settings. The Firebase/Identity Platform `apiKey` is a public project identifier,
 * not a secret (it is protected by API-key restrictions and authorized domains). Never put real
 * secrets in any environment file: everything here ships to the browser.
 */
export const environment = {
  production: true,
  useEmulators: false,
  firebase: {
    apiKey: 'REPLACE_WITH_IDENTITY_PLATFORM_WEB_API_KEY',
    authDomain: 'REPLACE_WITH_PROJECT_ID.firebaseapp.com',
    projectId: 'REPLACE_WITH_PROJECT_ID',
  },
  privacyNoticeVersion: '2026-11',
};
