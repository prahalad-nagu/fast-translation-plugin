import createKnex from "knex";
import { describe, expect, it } from "vitest";

import { TranslationRepository } from "../src/server/db/repository.js";
import { ensureServerSchema } from "../src/server/db/schema.js";

function createClient() {
  return createKnex({
    client: "sqlite3",
    connection: {
      filename: ":memory:",
    },
    useNullAsDefault: true,
  });
}

describe("TranslationRepository", () => {
  it("upserts and fetches stored translations", async () => {
    const client = createClient();

    try {
      const tables = {
        translations: "translation_records",
        overrides: "translation_overrides",
      };

      await ensureServerSchema(client, tables);
      const repository = new TranslationRepository(client, tables);

      await repository.upsertTranslation({
        tenantKey: "__global__",
        sourceLang: "en",
        targetLang: "es",
        sourceText: "Login",
        contextKey: "",
        translatedText: "Iniciar sesión",
        model: "gpt-4o-mini",
      });

      const stored = await repository.getTranslation({
        tenantKey: "__global__",
        sourceLang: "en",
        targetLang: "es",
        sourceText: "Login",
        contextKey: "",
      });

      expect(stored?.translatedText).toBe("Iniciar sesión");
      expect(stored?.model).toBe("gpt-4o-mini");
    } finally {
      await client.destroy();
    }
  });

  it("upserts, lists and deletes overrides", async () => {
    const client = createClient();

    try {
      const tables = {
        translations: "translation_records",
        overrides: "translation_overrides",
      };

      await ensureServerSchema(client, tables);
      const repository = new TranslationRepository(client, tables);

      await repository.upsertOverride({
        tenantKey: "tenant-a",
        sourceLang: "en",
        targetLang: "es",
        sourceText: "Login",
        contextKey: "",
        overrideText: "Acceder",
        updatedBy: "admin@tenant-a",
      });

      const found = await repository.getOverride({
        tenantKey: "tenant-a",
        sourceLang: "en",
        targetLang: "es",
        sourceText: "Login",
        contextKey: "",
      });

      expect(found?.overrideText).toBe("Acceder");

      const listed = await repository.listOverrides({ tenantKey: "tenant-a", targetLang: "es" });
      expect(listed).toHaveLength(1);
      expect(listed[0].overrideText).toBe("Acceder");

      const deleted = await repository.deleteOverride({
        tenantKey: "tenant-a",
        sourceLang: "en",
        targetLang: "es",
        sourceText: "Login",
        contextKey: "",
      });

      expect(deleted).toBe(true);

      const afterDelete = await repository.getOverride({
        tenantKey: "tenant-a",
        sourceLang: "en",
        targetLang: "es",
        sourceText: "Login",
        contextKey: "",
      });
      expect(afterDelete).toBeUndefined();
    } finally {
      await client.destroy();
    }
  });

  it("honors custom table names during schema setup", async () => {
    const client = createClient();

    try {
      const tables = {
        translations: "my_translations",
        overrides: "my_overrides",
      };

      await ensureServerSchema(client, tables);

      expect(await client.schema.hasTable("my_translations")).toBe(true);
      expect(await client.schema.hasTable("my_overrides")).toBe(true);

      const repository = new TranslationRepository(client, tables);
      await repository.upsertOverride({
        tenantKey: "__global__",
        sourceLang: "en",
        targetLang: "fr",
        sourceText: "SignUp",
        contextKey: "",
        overrideText: "Inscription",
      });

      const record = await repository.getOverride({
        tenantKey: "__global__",
        sourceLang: "en",
        targetLang: "fr",
        sourceText: "SignUp",
        contextKey: "",
      });

      expect(record?.overrideText).toBe("Inscription");
    } finally {
      await client.destroy();
    }
  });
});
