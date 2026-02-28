import type {
  DistributedTranslationCache,
  DistributedTranslationCacheEntry,
} from "../types.js";

interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  connect?(): Promise<void>;
  quit?(): Promise<void>;
}

interface RedisModuleLike {
  createClient(options?: { url?: string }): RedisClientLike;
}

export interface RedisDistributedCacheOptions {
  url?: string;
  keyPrefix?: string;
  ttlSeconds?: number;
  client?: RedisClientLike;
}

const DEFAULT_PREFIX = "fast-translation:";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export function createRedisDistributedCache(
  options: RedisDistributedCacheOptions = {},
): DistributedTranslationCache {
  const prefix = options.keyPrefix ?? DEFAULT_PREFIX;
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const externalClient = options.client;
  const ownsClient = !externalClient;

  if (!externalClient && (!options.url || !options.url.trim())) {
    throw new Error("Redis url is required when client is not provided");
  }

  let clientPromise: Promise<RedisClientLike> | undefined;

  const getClient = async (): Promise<RedisClientLike> => {
    if (externalClient) {
      return externalClient;
    }

    if (!clientPromise) {
      clientPromise = createClientFromUrl(options.url!.trim());
    }
    return clientPromise;
  };

  return {
    async get(key: string): Promise<DistributedTranslationCacheEntry | undefined> {
      const client = await getClient();
      const raw = await client.get(prefix + key);
      if (raw == null) {
        return undefined;
      }
      return deserializeEntry(raw);
    },
    async set(key: string, value: DistributedTranslationCacheEntry): Promise<void> {
      const client = await getClient();
      const payload = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await client.set(prefix + key, payload, { EX: ttlSeconds });
        return;
      }
      await client.set(prefix + key, payload);
    },
    async delete(key: string): Promise<void> {
      const client = await getClient();
      await client.del(prefix + key);
    },
    async close(): Promise<void> {
      if (!ownsClient) {
        return;
      }

      const client = await getClient();
      if (client.quit) {
        await client.quit();
      }
    },
  };
}

function deserializeEntry(raw: string): DistributedTranslationCacheEntry {
  try {
    const parsed = JSON.parse(raw) as {
      text?: unknown;
      fromOverride?: unknown;
      fromStored?: unknown;
      fromFallback?: unknown;
    };
    if (typeof parsed.text === "string") {
      return {
        text: parsed.text,
        fromOverride: Boolean(parsed.fromOverride),
        fromStored: Boolean(parsed.fromStored),
        fromFallback: Boolean(parsed.fromFallback),
      };
    }
  } catch {
    // Backward-compatible fallback for raw string values.
  }

  return { text: raw };
}

async function createClientFromUrl(url: string): Promise<RedisClientLike> {
  const redisModule = (await import("redis")) as unknown as RedisModuleLike;
  const client = redisModule.createClient({ url });
  if (client.connect) {
    await client.connect();
  }
  return client;
}
