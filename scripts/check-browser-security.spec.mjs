import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrowserEvidence,
  extractBrowserTargets,
  validateBrowserSecurityExceptions,
} from './check-browser-security.mjs';

const DOCKERFILE = [
  'ARG TARGETARCH',
  'RUN apt-get install $([ "$TARGETARCH" = arm64 ] && echo "chromium chromium-sandbox")',
  'RUN if [ "$TARGETARCH" = arm64 ]; then ln -s /usr/bin/chromium /usr/local/bin/puppeteer-chrome; else',
  "PUPPETEER_CACHE_DIR=/opt/puppeteer ./node_modules/.bin/puppeteer browsers install 'chrome@153.0.8010.36'; fi",
  'ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/puppeteer-chrome',
].join('\n');

const exception = {
  id: 'arm64-debian-chromium-review',
  architecture: 'arm64',
  product: 'chromium',
  advisory: 'vendor-unfixed-high-critical',
  reason: 'The distro browser may have advisories that do not yet have a fixed package.',
  reviewBy: '2026-10-15',
  removeWhen: 'The affected advisories are fixed or the browser source changes.',
};

const documentWith = (...exceptions) => ({ schemaVersion: 1, exceptions });

test('extracts the pinned amd64 Chrome for Testing identity', () => {
  assert.deepEqual(extractBrowserTargets(DOCKERFILE).amd64, {
    architecture: 'amd64',
    product: 'chrome-for-testing',
    version: '153.0.8010.36',
    source: 'dockerfile-pin',
  });
});

test('identifies arm64 as distro-managed Chromium', () => {
  assert.deepEqual(extractBrowserTargets(DOCKERFILE).arm64, {
    architecture: 'arm64',
    product: 'chromium',
    version: null,
    source: 'debian-package',
  });
});

test('rejects an exception after its review date', () => {
  assert.throws(
    () => validateBrowserSecurityExceptions(documentWith({ ...exception, reviewBy: '2026-09-20' }), '2026-09-21'),
    /expired.*arm64-debian-chromium-review.*2026-09-20/i,
  );
});

test('accepts a future-dated well-formed exception', () => {
  assert.equal(validateBrowserSecurityExceptions(documentWith(exception), '2026-09-21').exceptions.length, 1);
});

test('rejects duplicate and malformed exception records', () => {
  assert.throws(
    () => validateBrowserSecurityExceptions(documentWith(exception, { ...exception }), '2026-09-21'),
    /duplicate.*arm64-debian-chromium-review/i,
  );
  assert.throws(
    () => validateBrowserSecurityExceptions(documentWith({ ...exception, reviewBy: '21-10-2026' }), '2026-09-21'),
    /reviewBy.*YYYY-MM-DD/i,
  );
});

test('records the exact observed browser version without claiming advisory completeness', () => {
  const evidence = buildBrowserEvidence({
    dockerfile: DOCKERFILE,
    exceptionDocument: documentWith(),
    platform: 'linux/amd64',
    observed: 'Google Chrome for Testing 153.0.8010.36',
    today: '2026-09-21',
  });
  assert.equal(evidence.observedVersion, '153.0.8010.36');
  assert.equal(evidence.advisoryCoverage, 'not-verified');
  assert.equal(evidence.exceptionCount, 0);
});

test('records the runtime-resolved arm64 Chromium version', () => {
  const evidence = buildBrowserEvidence({
    dockerfile: DOCKERFILE,
    exceptionDocument: documentWith(exception),
    platform: 'linux/arm64',
    observed: 'Chromium 151.0.7922.169 built on Debian GNU/Linux 12',
    today: '2026-09-21',
  });
  assert.equal(evidence.product, 'chromium');
  assert.equal(evidence.observedVersion, '151.0.7922.169');
  assert.equal(evidence.advisoryCoverage, 'not-verified');
});

test('rejects an amd64 runtime browser that does not match the Dockerfile pin', () => {
  assert.throws(
    () => buildBrowserEvidence({
      dockerfile: DOCKERFILE,
      exceptionDocument: documentWith(),
      platform: 'linux/amd64',
      observed: 'Google Chrome for Testing 154.0.8100.1',
      today: '2026-09-21',
    }),
    /observed.*154\.0\.8100\.1.*pinned.*153\.0\.8010\.36/i,
  );
});
