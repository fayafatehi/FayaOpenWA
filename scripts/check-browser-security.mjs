#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ARCHITECTURES = new Set(['amd64', 'arm64']);
const PRODUCTS = new Set(['chrome-for-testing', 'chromium']);

const currentUtcDate = () => new Date().toISOString().slice(0, 10);

function assertDateOnly(value, label) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must use a real YYYY-MM-DD date`);
  }
}

function requiredString(record, field) {
  const value = record?.[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`browser security exception ${field} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeArchitecture(platform) {
  const value = String(platform ?? '').replace(/^linux\//, '');
  if (!ARCHITECTURES.has(value)) {
    throw new Error(`unsupported browser architecture ${JSON.stringify(platform)}; expected linux/amd64 or linux/arm64`);
  }
  return value;
}

export function extractBrowserTargets(dockerfile) {
  if (typeof dockerfile !== 'string' || dockerfile.trim() === '') {
    throw new Error('Dockerfile content is required');
  }

  const pins = [...dockerfile.matchAll(/browsers\s+install\s+['"]chrome@(\d+(?:\.\d+){3})['"]/g)].map(
    match => match[1],
  );
  if (pins.length !== 1) {
    throw new Error(`expected exactly one amd64 chrome@<version> Dockerfile pin, found ${pins.length}`);
  }

  const arm64DistroChromium =
    dockerfile.includes('TARGETARCH') &&
    dockerfile.includes('chromium chromium-sandbox') &&
    dockerfile.includes('/usr/bin/chromium');
  if (!arm64DistroChromium) {
    throw new Error('expected the arm64 Dockerfile path to install and execute distro Chromium');
  }

  return {
    amd64: {
      architecture: 'amd64',
      product: 'chrome-for-testing',
      version: pins[0],
      source: 'dockerfile-pin',
    },
    arm64: {
      architecture: 'arm64',
      product: 'chromium',
      version: null,
      source: 'debian-package',
    },
  };
}

export function validateBrowserSecurityExceptions(document, today = currentUtcDate()) {
  assertDateOnly(today, 'today');

  if (document == null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('browser security exceptions document must be an object');
  }
  if (document.schemaVersion !== 1) {
    throw new Error('browser security exceptions schemaVersion must be 1');
  }
  if (!Array.isArray(document.exceptions)) {
    throw new Error('browser security exceptions must contain an exceptions array');
  }

  const seen = new Set();
  const exceptions = document.exceptions.map(raw => {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('each browser security exception must be an object');
    }

    const id = requiredString(raw, 'id');
    if (seen.has(id)) throw new Error(`duplicate browser security exception id ${id}`);
    seen.add(id);

    const architecture = requiredString(raw, 'architecture');
    if (!ARCHITECTURES.has(architecture)) {
      throw new Error(`browser security exception ${id} has unsupported architecture ${architecture}`);
    }

    const product = requiredString(raw, 'product');
    if (!PRODUCTS.has(product)) {
      throw new Error(`browser security exception ${id} has unsupported product ${product}`);
    }

    const advisory = requiredString(raw, 'advisory');
    const reason = requiredString(raw, 'reason');
    const reviewBy = requiredString(raw, 'reviewBy');
    const removeWhen = requiredString(raw, 'removeWhen');
    assertDateOnly(reviewBy, `browser security exception ${id} reviewBy`);

    if (reviewBy < today) {
      throw new Error(`browser security exception expired: ${id} reviewBy ${reviewBy} (today ${today})`);
    }

    return { id, architecture, product, advisory, reason, reviewBy, removeWhen };
  });

  return { schemaVersion: 1, exceptions };
}

function parseObservedVersion(target, observed) {
  if (typeof observed !== 'string' || observed.trim() === '') {
    throw new Error(`observed browser version output is required for ${target.architecture}`);
  }

  if (target.product === 'chrome-for-testing' && !/chrome/i.test(observed)) {
    throw new Error(`expected Chrome version output for ${target.architecture}, received ${JSON.stringify(observed)}`);
  }
  if (target.product === 'chromium' && !/chromium/i.test(observed)) {
    throw new Error(`expected Chromium version output for ${target.architecture}, received ${JSON.stringify(observed)}`);
  }

  const match = observed.match(/\b(\d+(?:\.\d+){2,3})\b/);
  if (!match) {
    throw new Error(`could not parse a browser version from ${JSON.stringify(observed)}`);
  }

  if (target.version && match[1] !== target.version) {
    throw new Error(
      `observed browser ${match[1]} does not match pinned Dockerfile version ${target.version} for ${target.architecture}`,
    );
  }

  return match[1];
}

export function buildBrowserEvidence({ dockerfile, exceptionDocument, platform, observed, today = currentUtcDate() }) {
  const architecture = normalizeArchitecture(platform);
  const targets = extractBrowserTargets(dockerfile);
  const target = targets[architecture];
  const exceptionPolicy = validateBrowserSecurityExceptions(exceptionDocument, today);
  const observedVersion = parseObservedVersion(target, observed);
  const applicable = exceptionPolicy.exceptions.filter(
    item => item.architecture === architecture && item.product === target.product,
  );

  return {
    platform: `linux/${architecture}`,
    architecture,
    product: target.product,
    source: target.source,
    pinnedVersion: target.version,
    observedVersion,
    advisoryCoverage: 'not-verified',
    exceptionCount: applicable.length,
    exceptionIds: applicable.map(item => item.id),
    note:
      'This gate validates browser identity and exception freshness only; live browser advisory completeness is not verified.',
  };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--platform' || arg === '--observed') {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }

  if (Boolean(options.platform) !== Boolean(options.observed)) {
    throw new Error('--platform and --observed must be supplied together');
  }
  return options;
}

function printEvidence(evidence) {
  console.log(`platform=${evidence.platform}`);
  console.log(`product=${evidence.product}`);
  console.log(`source=${evidence.source}`);
  console.log(`pinnedVersion=${evidence.pinnedVersion ?? 'distro-managed'}`);
  console.log(`observedVersion=${evidence.observedVersion}`);
  console.log(`advisoryCoverage=${evidence.advisoryCoverage}`);
  console.log(`exceptionCount=${evidence.exceptionCount}`);
  console.log(`exceptionIds=${evidence.exceptionIds.join(',') || 'none'}`);
  console.log(`note=${evidence.note}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const dockerfile = readFileSync(resolve('Dockerfile'), 'utf8');
    const exceptionDocument = JSON.parse(readFileSync(resolve('scripts/browser-security-exceptions.json'), 'utf8'));
    const options = parseArgs(process.argv.slice(2));

    if (options.platform) {
      printEvidence(
        buildBrowserEvidence({
          dockerfile,
          exceptionDocument,
          platform: options.platform,
          observed: options.observed,
        }),
      );
    } else {
      const targets = extractBrowserTargets(dockerfile);
      const exceptions = validateBrowserSecurityExceptions(exceptionDocument);
      console.log(
        JSON.stringify(
          {
            targets,
            advisoryCoverage: 'not-verified',
            exceptionCount: exceptions.exceptions.length,
            note:
              'Configuration validation only; exact runtime versions are recorded by scheduled/release image-scan jobs.',
          },
          null,
          2,
        ),
      );
    }
  } catch (error) {
    console.error(`check:browser-security failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
