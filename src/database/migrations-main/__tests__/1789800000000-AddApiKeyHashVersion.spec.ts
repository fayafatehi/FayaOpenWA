import { DataSource } from 'typeorm';
import { CreateAuthAuditTables1779900000000 } from '../1779900000000-CreateAuthAuditTables';
import { AddApiKeyHashVersion1789800000000 } from '../1789800000000-AddApiKeyHashVersion';

describe('AddApiKeyHashVersion migration', () => {
  let ds: DataSource;

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [], synchronize: false });
    await ds.initialize();
  });

  afterEach(async () => {
    await ds.destroy();
  });

  it('labels pre-existing API-key rows as legacy SHA-256', async () => {
    const qr = ds.createQueryRunner();
    await new CreateAuthAuditTables1779900000000().up(qr);
    await qr.query("INSERT INTO api_keys (id, name, keyHash, keyPrefix) VALUES ('1', 'legacy', 'hash', 'pref')");

    await new AddApiKeyHashVersion1789800000000().up(qr);

    const rows = (await qr.query("SELECT hashVersion FROM api_keys WHERE id = '1'")) as Array<{ hashVersion: string }>;
    expect(rows[0].hashVersion).toBe('sha256-v1');
    await qr.release();
  });

  it('is idempotent and gives new rows the legacy-safe default', async () => {
    const qr = ds.createQueryRunner();
    await new CreateAuthAuditTables1779900000000().up(qr);
    const migration = new AddApiKeyHashVersion1789800000000();
    await migration.up(qr);
    await expect(migration.up(qr)).resolves.not.toThrow();

    await qr.query("INSERT INTO api_keys (id, name, keyHash, keyPrefix) VALUES ('2', 'new', 'hash2', 'pref2')");
    const rows = (await qr.query("SELECT hashVersion FROM api_keys WHERE id = '2'")) as Array<{ hashVersion: string }>;
    expect(rows[0].hashVersion).toBe('sha256-v1');
    await qr.release();
  });

  it('down removes only the hashVersion column', async () => {
    const qr = ds.createQueryRunner();
    await new CreateAuthAuditTables1779900000000().up(qr);
    const migration = new AddApiKeyHashVersion1789800000000();
    await migration.up(qr);
    await migration.down(qr);

    const columns = (await qr.query("PRAGMA table_info('api_keys')")) as Array<{ name: string }>;
    expect(columns.map(c => c.name)).not.toContain('hashVersion');
    expect(columns.map(c => c.name)).toContain('keyHash');
    await qr.release();
  });
});
