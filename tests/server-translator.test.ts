import createKnex from "knex";
import { describe, expect, it, vi } from "vitest";

import { createServerTranslator } from "../src/server/create-server-translator.js";
import type { TranslationProvider } from "../src/providers/base.js";

function createSqliteClient() {
  return createKnex({
    client: "sqlite3",
    connection: {
      filename: ":memory:",
    },
    useNullAsDefault: true,
  });
}

function createMockProvider(): { provider: TranslationProvider; translate: ReturnType<typeof vi.fn> } {
  const translate = vi.fn(async (text: string, _source: string, target: string) => `${text}-${target}`);
  return { provider: { translate }, translate };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ServerTranslatorService", () => {
  it("creates tables on init and supports custom table names", async () => {
    const client = createSqliteClient();

    try {
      const { provider } = createMockProvider();
      const translator = createServerTranslator({
        provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
          tableNames: {
            translations: "tenant_translations",
            overrides: "tenant_overrides",
          },
        },
      });

      await translator.init();

      expect(await client.schema.hasTable("tenant_translations")).toBe(true);
      expect(await client.schema.hasTable("tenant_overrides")).toBe(true);

      await translator.close();
    } finally {
      await client.destroy();
    }
  });

  it("resolves miss -> AI -> persist and serves from DB on new instance", async () => {
    const client = createSqliteClient();

    try {
      const first = createMockProvider();
      first.translate.mockResolvedValue("Iniciar sesión");

      const translatorA = createServerTranslator({
        provider: first.provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translatorA.init();

      const firstResult = await translatorA.translateText("Login", "es");
      expect(firstResult).toBe("Iniciar sesión");
      expect(first.translate).toHaveBeenCalledTimes(1);

      await translatorA.close();

      const second = createMockProvider();
      second.translate.mockResolvedValue("UNEXPECTED");

      const translatorB = createServerTranslator({
        provider: second.provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translatorB.init();

      const secondResult = await translatorB.translateText("Login", "es");
      expect(secondResult).toBe("Iniciar sesión");
      expect(second.translate).toHaveBeenCalledTimes(0);

      await translatorB.close();
    } finally {
      await client.destroy();
    }
  });

  it("applies override precedence and delete reverts to stored translation", async () => {
    const client = createSqliteClient();

    try {
      const mock = createMockProvider();
      mock.translate.mockResolvedValue("Iniciar sesión");

      const translator = createServerTranslator({
        provider: mock.provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translator.init();

      const base = await translator.translateText("Login", "es");
      expect(base).toBe("Iniciar sesión");
      expect(mock.translate).toHaveBeenCalledTimes(1);

      await translator.setOverride({
        sourceText: "Login",
        targetLang: "es",
        overrideText: "Acceder",
      });

      const withOverride = await translator.translateText("Login", "es");
      expect(withOverride).toBe("Acceder");
      expect(mock.translate).toHaveBeenCalledTimes(1);

      expect(await translator.getOverride({ sourceText: "Login", targetLang: "es" })).toBe("Acceder");

      const deleted = await translator.deleteOverride({ sourceText: "Login", targetLang: "es" });
      expect(deleted).toBe(true);

      const reverted = await translator.translateText("Login", "es");
      expect(reverted).toBe("Iniciar sesión");
      expect(mock.translate).toHaveBeenCalledTimes(1);

      await translator.close();
    } finally {
      await client.destroy();
    }
  });

  it("requires tenantId when tenancy.requireTenantId is enabled", async () => {
    const client = createSqliteClient();

    try {
      const mock = createMockProvider();
      mock.translate.mockResolvedValue("En attente");

      const translator = createServerTranslator({
        provider: mock.provider,
        database: {
          type: "sqlite",
          client,
          tenancy: {
            enabled: true,
            requireTenantId: true,
          },
          autoCreateTables: true,
        },
      });
      await translator.init();

      await expect(translator.translateText("Waiting for approval", "fr")).rejects.toThrow(
        "tenantId is required",
      );

      await expect(
        translator.translateText("Waiting for approval", "fr", { tenantId: "tenant-a" }),
      ).resolves.toBe("En attente");

      await translator.close();
    } finally {
      await client.destroy();
    }
  });

  it("lists overrides with filters", async () => {
    const client = createSqliteClient();

    try {
      const translator = createServerTranslator({
        provider: createMockProvider().provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translator.init();

      await translator.setOverride({
        sourceText: "Login",
        targetLang: "es",
        overrideText: "Acceder",
      });
      await translator.setOverride({
        sourceText: "SignUp",
        targetLang: "fr",
        overrideText: "Inscription",
      });

      const spanish = await translator.listOverrides({ targetLang: "es", limit: 10 });
      expect(spanish).toHaveLength(1);
      expect(spanish[0].overrideText).toBe("Acceder");

      await translator.close();
    } finally {
      await client.destroy();
    }
  });

  it("returns source text and emits onError when provider fails", async () => {
    const client = createSqliteClient();

    try {
      const mock = createMockProvider();
      const onError = vi.fn();
      mock.translate.mockRejectedValue(new Error("upstream timeout"));

      const translator = createServerTranslator({
        provider: mock.provider,
        onError,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translator.init();

      const result = await translator.translateText("Please change the password", "es");
      expect(result).toBe("Please change the password");
      expect(onError).toHaveBeenCalledTimes(1);

      await translator.close();
    } finally {
      await client.destroy();
    }
  });

  it("keeps override precedence when an old request completes after override update", async () => {
    const client = createSqliteClient();

    try {
      const deferred = createDeferred<string>();
      const mock = createMockProvider();
      mock.translate.mockImplementationOnce(() => deferred.promise);

      const translator = createServerTranslator({
        provider: mock.provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translator.init();

      const inFlight = translator.translateText("Login", "es");

      await translator.setOverride({
        sourceText: "Login",
        targetLang: "es",
        overrideText: "Acceder",
      });

      deferred.resolve("Iniciar sesión");
      await expect(inFlight).resolves.toBe("Acceder");

      await expect(translator.translateText("Login", "es")).resolves.toBe("Acceder");
      await translator.close();
    } finally {
      await client.destroy();
    }
  });

  it("throws if init cannot create DB client config", async () => {
    const translator = createServerTranslator({
      provider: createMockProvider().provider,
      database: {
        type: "sqlite",
      },
    });

    await expect(translator.init()).rejects.toThrow("connectionString is required");
  });

  it("returns detailed metadata for provider and stored paths", async () => {
    const client = createSqliteClient();

    try {
      const first = createMockProvider();
      first.translate.mockResolvedValue("Iniciar sesión");

      const translatorA = createServerTranslator({
        provider: first.provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translatorA.init();

      const providerResult = await translatorA.translateTextDetailed("Login", "es");
      expect(providerResult.translatedText).toBe("Iniciar sesión");
      expect(providerResult.origin).toBe("provider");
      expect(providerResult.fromOverride).toBe(false);
      expect(providerResult.fromStored).toBe(false);
      expect(providerResult.fromFallback).toBe(false);
      expect(providerResult.tenantId).toBe("__global__");

      await translatorA.close();

      const second = createMockProvider();
      second.translate.mockResolvedValue("UNEXPECTED");

      const translatorB = createServerTranslator({
        provider: second.provider,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translatorB.init();

      const storedResult = await translatorB.translateTextDetailed("Login", "es");
      expect(storedResult.translatedText).toBe("Iniciar sesión");
      expect(storedResult.origin).toBe("stored");
      expect(storedResult.fromStored).toBe(true);
      expect(second.translate).toHaveBeenCalledTimes(0);

      await translatorB.close();
    } finally {
      await client.destroy();
    }
  });

  it("uses distributed cache across instances when provided", async () => {
    const cacheData = new Map<string, { text: string; fromStored?: boolean; fromOverride?: boolean }>();
    const distributedCache = {
      get: vi.fn(async (key: string) => cacheData.get(key)),
      set: vi.fn(async (key: string, value: { text: string }) => {
        cacheData.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        cacheData.delete(key);
      }),
    };

    const client = createSqliteClient();

    try {
      const first = createMockProvider();
      first.translate.mockResolvedValue("Iniciar sesión");

      const translatorA = createServerTranslator({
        provider: first.provider,
        distributedCache,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translatorA.init();
      await translatorA.translateText("Login", "es");
      await translatorA.close();

      const second = createMockProvider();
      second.translate.mockResolvedValue("UNEXPECTED");

      const translatorB = createServerTranslator({
        provider: second.provider,
        distributedCache,
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });
      await translatorB.init();

      const result = await translatorB.translateTextDetailed("Login", "es");
      expect(result.translatedText).toBe("Iniciar sesión");
      expect(result.origin).toBe("distributed_cache");
      expect(second.translate).toHaveBeenCalledTimes(0);
      expect(distributedCache.set).toHaveBeenCalled();

      await translatorB.close();
    } finally {
      await client.destroy();
    }
  });

  it("blocks schema auto-create in prod mode", async () => {
    const client = createSqliteClient();

    try {
      const translator = createServerTranslator({
        provider: createMockProvider().provider,
        environment: "prod",
        database: {
          type: "sqlite",
          client,
          autoCreateTables: true,
        },
      });

      await expect(translator.init()).rejects.toThrow("not allowed in prod");
    } finally {
      await client.destroy();
    }
  });

  it("does not destroy externally provided client on close", async () => {
    const client = createSqliteClient();

    try {
      const translator = createServerTranslator({
        provider: createMockProvider().provider,
        database: {
          type: "sqlite",
          client,
        },
      });

      await translator.init();
      await translator.close();

      const row = await client.raw("select 1 as ok");
      expect(row).toBeDefined();
    } finally {
      await client.destroy();
    }
  });
});
