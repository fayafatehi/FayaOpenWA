import { createHash, createHmac } from 'crypto';
import { API_KEY_HASH_VERSIONS, hashApiKey, hashApiKeyForVersion, hashApiKeyRecord } from './api-key-hash';

describe('hashApiKey', () => {
  it('uses plain SHA-256 when no pepper is set (preserves existing stored hashes)', () => {
    expect(hashApiKey('owa_secret')).toBe(createHash('sha256').update('owa_secret').digest('hex'));
    expect(hashApiKey('owa_secret', undefined)).toBe(createHash('sha256').update('owa_secret').digest('hex'));
  });

  it('uses HMAC-SHA256 with the pepper when set, distinct from the un-peppered hash', () => {
    const peppered = hashApiKey('owa_secret', 'server-pepper');
    expect(peppered).toBe(createHmac('sha256', 'server-pepper').update('owa_secret').digest('hex'));
    expect(peppered).not.toBe(hashApiKey('owa_secret'));
  });

  it('is deterministic for the same key + pepper', () => {
    expect(hashApiKey('k', 'p')).toBe(hashApiKey('k', 'p'));
  });
});

describe('versioned API-key hashing', () => {
  it('labels legacy SHA-256 records explicitly', () => {
    expect(hashApiKeyRecord('owa_secret')).toEqual({
      keyHash: createHash('sha256').update('owa_secret').digest('hex'),
      hashVersion: API_KEY_HASH_VERSIONS.SHA256_V1,
    });
  });

  it('labels peppered HMAC records explicitly', () => {
    expect(hashApiKeyRecord('owa_secret', 'server-pepper')).toEqual({
      keyHash: createHmac('sha256', 'server-pepper').update('owa_secret').digest('hex'),
      hashVersion: API_KEY_HASH_VERSIONS.HMAC_SHA256_V1,
    });
  });

  it('can verify the legacy algorithm even after a pepper is configured', () => {
    expect(hashApiKeyForVersion('owa_secret', API_KEY_HASH_VERSIONS.SHA256_V1, 'server-pepper')).toBe(
      createHash('sha256').update('owa_secret').digest('hex'),
    );
  });

  it('requires the pepper to evaluate an HMAC-versioned record', () => {
    expect(() => hashApiKeyForVersion('owa_secret', API_KEY_HASH_VERSIONS.HMAC_SHA256_V1)).toThrow(/pepper/i);
  });
});
