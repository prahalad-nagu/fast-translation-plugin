import { describe, expect, it, vi } from "vitest";

import { createRedisDistributedCache } from "../src/cache/distributed.js";

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    quit: vi.fn(async () => {}),
  };
}

describe("createRedisDistributedCache", () => {
  it("reads and writes distributed entries using an injected client", async () => {
    const client = createMockRedis();
    const cache = createRedisDistributedCache({
      client,
      keyPrefix: "t:",
      ttlSeconds: 60,
    });

    await cache.set("abc", {
      text: "Iniciar sesión",
      fromStored: true,
    });
    const value = await cache.get("abc");

    expect(value).toEqual({
      text: "Iniciar sesión",
      fromOverride: false,
      fromStored: true,
      fromFallback: false,
    });
    expect(client.set).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("deletes keys through the adapter", async () => {
    const client = createMockRedis();
    const cache = createRedisDistributedCache({
      client,
      keyPrefix: "t:",
    });

    await cache.set("abc", { text: "Hello" });
    await cache.delete?.("abc");
    const value = await cache.get("abc");

    expect(value).toBeUndefined();
    expect(client.del).toHaveBeenCalledTimes(1);
  });

  it("requires url when client is not provided", () => {
    expect(() => createRedisDistributedCache()).toThrow(
      "Redis url is required when client is not provided",
    );
  });
});
