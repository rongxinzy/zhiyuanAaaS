// Signed variant of electron-builder.overlay.yml for Certum SimplySign cloud
// certificates, consumed by the central signing workflow in rongxinzy/RongxinAI
// (Sign Zhiyuan Enterprise Windows package). The overlay is parsed from the YAML
// file so the two configs cannot drift apart; only win.signtoolOptions is added
// on top. electron-builder then signs the packaged executables and the NSIS
// installer in a single pass (re-signing the installer afterwards would leave
// the inner executables unsigned). The certificate private key stays in the
// Certum cloud HSM; the central workflow connects SimplySign through the shared
// setup-certum-signing action and injects CERTUM_CERT_THUMBPRINT, so this
// repository holds no certificate material or GitHub secret.

const fs = require('node:fs');
const path = require('node:path');

const yaml = require('js-yaml');

const overlayFile = path.join(__dirname, 'electron-builder.overlay.yml');
const overlayConfig = yaml.load(fs.readFileSync(overlayFile, 'utf8'));

const certificateThumbprint = (process.env.CERTUM_CERT_THUMBPRINT || '')
  .replace(/[^0-9a-f]/gi, '')
  .toUpperCase();

if (!/^[0-9A-F]{40}$/.test(certificateThumbprint)) {
  throw new Error(
    'CERTUM_CERT_THUMBPRINT must contain the 40-character SHA-1 thumbprint of the Certum ' +
      'code-signing certificate. It is injected by the central RongxinAI signing workflow ' +
      'after the setup-certum-signing action connects SimplySign.',
  );
}

module.exports = {
  ...overlayConfig,
  win: {
    ...(overlayConfig.win || {}),
    signtoolOptions: {
      certificateSha1: certificateThumbprint,
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://time.certum.pl',
    },
  },
};
