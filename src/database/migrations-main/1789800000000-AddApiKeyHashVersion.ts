import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddApiKeyHashVersion1789800000000 implements MigrationInterface {
  name = 'AddApiKeyHashVersion1789800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('api_keys');
    if (!table || table.findColumnByName('hashVersion')) return;

    await queryRunner.addColumn(
      'api_keys',
      new TableColumn({
        name: 'hashVersion',
        type: 'varchar',
        length: '32',
        isNullable: false,
        default: "'sha256-v1'",
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('api_keys');
    if (!table?.findColumnByName('hashVersion')) return;
    await queryRunner.dropColumn('api_keys', 'hashVersion');
  }
}
