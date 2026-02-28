CREATE TABLE IF NOT EXISTS translation_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_key VARCHAR(191) NOT NULL DEFAULT '__global__',
  source_lang VARCHAR(16) NOT NULL,
  target_lang VARCHAR(16) NOT NULL,
  source_text VARCHAR(512) NOT NULL,
  context_key VARCHAR(255) NOT NULL DEFAULT '',
  translated_text TEXT NOT NULL,
  model VARCHAR(120) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT translation_records_unique_key
    UNIQUE (tenant_key, source_lang, target_lang, source_text, context_key)
);

CREATE INDEX IF NOT EXISTS translation_records_tenant_target_idx
  ON translation_records (tenant_key, target_lang);

CREATE TABLE IF NOT EXISTS translation_overrides (
  id BIGSERIAL PRIMARY KEY,
  tenant_key VARCHAR(191) NOT NULL DEFAULT '__global__',
  source_lang VARCHAR(16) NOT NULL,
  target_lang VARCHAR(16) NOT NULL,
  source_text VARCHAR(512) NOT NULL,
  context_key VARCHAR(255) NOT NULL DEFAULT '',
  override_text TEXT NOT NULL,
  updated_by VARCHAR(191) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT translation_overrides_unique_key
    UNIQUE (tenant_key, source_lang, target_lang, source_text, context_key)
);

CREATE INDEX IF NOT EXISTS translation_overrides_tenant_target_idx
  ON translation_overrides (tenant_key, target_lang);
