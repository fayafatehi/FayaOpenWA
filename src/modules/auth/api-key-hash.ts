import { createHash, createHmac } from 'crypto';

export const API_KEY_HASH_VERSIONS = {
  SHA256_V1: 'sha256-v1',
  HMAC_SHA256_V1: 'hmac-sha256-v1',
} as const;

export type ApiKeyHashVersion = (typeof API_KEY_HASH_VERSIONS)[keyof typeof API_KEY_HASH_VERSIONS];

export interface ApiKeyHashRecord {
  keyHash: string;
  hashVersion: ApiKeyHashVersion;
}

/**
 * Historical convenience helper retained for callers/tests. With a pepper it produces HMAC-SHA256;
 * without one it produces the legacy SHA-256 digest.
 */
export function hashApiKey(rawKey: string, pepper?: string): string {
  return pepper
    ? createHmac('sha256', pepper).update(rawKey).digest('hex')
    : createHash('sha256').update(rawKey).digest('hex');
}

/** The storage representation new keys should use under the current deployment policy. */
export function hashApiKeyRecord(rawKey: string, pepper?: string): ApiKeyHashRecord {
  return pepper
    ? {
        keyHash: createHmac('sha256', pepper).update(rawKey).digest('hex'),
        hashVersion: API_KEY_HASH_VERSIONS.HMAC_SHA256_V1,
      }
    : {
        keyHash: createHash('sha256').update(rawKey).digest('hex'),
        hashVersion: API_KEY_HASH_VERSIONS.SHA256_V1,
      };
}

/**
 * Evaluate a raw key using the algorithm named by a stored row.
 *
 * This is intentionally version-directed rather than "use the current config": after API_KEY_PEPPER
 * is enabled, an existing sha256-v1 row must still be verifiable so AuthService can authenticate it
 * once and upgrade it to hmac-sha256-v1. HMAC rows fail closed when the pepper is unavailable.
 */
export function hashApiKeyForVersion(rawKey: string, version: string, pepper?: string): string {
  switch (version) {
    case API_KEY_HASH_VERSIONS.SHA256_V1:
      return createHash('sha256').update(rawKey).digest('hex');
    case API_KEY_HASH_VERSIONS.HMAC_SHA256_V1:
      if (!pepper) {
        throw new Error('API_KEY_PEPPER is required to evaluate an hmac-sha256-v1 API key');
      }
      return createHmac('sha256', pepper).update(rawKey).digest('hex');
    default:
      throw new Error(`Unsupported API key hash version: ${version}`);
  }
}
