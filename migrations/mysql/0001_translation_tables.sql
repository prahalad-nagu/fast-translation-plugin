CREATE TABLE IF NOT EXISTS translation_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_key VARCHAR(191) NOT NULL DEFAULT '__global__',
  source_lang VARCHAR(16) NOT NULL,
  target_lang VARCHAR(16) NOT NULL,
  source_text VARCHAR(512) NOT NULL,
  context_key VARCHAR(255) NOT NULL DEFAULT '',
  translated_text TEXT NOT NULL,
  model VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY translation_records_unique_key
    (tenant_key, source_lang, target_lang, source_text, context_key),
  KEY translation_records_tenant_target_idx (tenant_key, target_lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS translation_overrides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_key VARCHAR(191) NOT NULL DEFAULT '__global__',
  source_lang VARCHAR(16) NOT NULL,
  target_lang VARCHAR(16) NOT NULL,
  source_text VARCHAR(512) NOT NULL,
  context_key VARCHAR(255) NOT NULL DEFAULT '',
  override_text TEXT NOT NULL,
  updated_by VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY translation_overrides_unique_key
    (tenant_key, source_lang, target_lang, source_text, context_key),
  KEY translation_overrides_tenant_target_idx (tenant_key, target_lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
