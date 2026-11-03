/** Local development against the Firebase Auth emulator (see docker-compose.yml). */
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'demo-api-key', // any string works with the emulator
    authDomain: 'localhost',
    projectId: 'demo-scholarscope',
  },
  privacyNoticeVersion: '2026-11',
};
