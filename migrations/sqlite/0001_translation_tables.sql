CREATE TABLE IF NOT EXISTS translation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_key TEXT NOT NULL DEFAULT '__global__',
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT NOT NULL,
  context_key TEXT NOT NULL DEFAULT '',
  translated_text TEXT NOT NULL,
  model TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS translation_records_unique_key
  ON translation_records (tenant_key, source_lang, target_lang, source_text, context_key);

CREATE INDEX IF NOT EXISTS translation_records_tenant_target_idx
  ON translation_records (tenant_key, target_lang);

CREATE TABLE IF NOT EXISTS translation_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_key TEXT NOT NULL DEFAULT '__global__',
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_text TEXT NOT NULL,
  context_key TEXT NOT NULL DEFAULT '',
  override_text TEXT NOT NULL,
  updated_by TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS translation_overrides_unique_key
  ON translation_overrides (tenant_key, source_lang, target_lang, source_text, context_key);

CREATE INDEX IF NOT EXISTS translation_overrides_tenant_target_idx
  ON translation_overrides (tenant_key, target_lang);
