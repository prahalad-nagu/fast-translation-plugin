# Production Migration Scaffolding

Use these SQL files to create schema in production with your deployment pipeline.

Recommended production setting:

- `environment: "prod"`
- `database.autoCreateTables: false`

Run the SQL file matching your database engine:

- `migrations/postgres/0001_translation_tables.sql`
- `migrations/mysql/0001_translation_tables.sql`
- `migrations/sqlite/0001_translation_tables.sql`

This package intentionally avoids creating databases; it only uses existing connections.
