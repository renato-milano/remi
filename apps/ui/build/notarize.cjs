// afterSign hook: notarizza l'app macOS SOLO se ci sono le credenziali Apple.
// Senza, no-op → build non firmata (testabile in locale, distribuibile via Homebrew).
// Attivazione futura: bastano i secret in CI, nessun cambio di codice.
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } =
    process.env;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  // Preferisci l'API key App Store Connect se presente, altrimenti Apple ID.
  if (APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER) {
    console.log('[notarize] notarizzazione con API key App Store Connect…');
    return notarize({
      tool: 'notarytool',
      appPath,
      appleApiKey: APPLE_API_KEY,
      appleApiKeyId: APPLE_API_KEY_ID,
      appleApiIssuer: APPLE_API_ISSUER,
    });
  }

  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    console.log('[notarize] notarizzazione con Apple ID…');
    return notarize({
      tool: 'notarytool',
      appPath,
      appleId: APPLE_ID,
      appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
      teamId: APPLE_TEAM_ID,
    });
  }

  console.log('[notarize] saltata: nessuna credenziale Apple (build non firmata).');
};
