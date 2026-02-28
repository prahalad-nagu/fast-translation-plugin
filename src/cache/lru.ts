interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class LruTtlCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new Error("maxSize must be a positive integer");
    }

    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs must be a positive number");
    }

    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const current = this.entries.get(key);
    if (!current) {
      return undefined;
    }

    if (current.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, current);
    return current.value;
  }

  set(key: K, value: V): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }

    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });

    while (this.entries.size > this.maxSize) {
      const leastRecentlyUsedKey = this.entries.keys().next().value;
      if (leastRecentlyUsedKey === undefined) {
        break;
      }
      this.entries.delete(leastRecentlyUsedKey);
    }
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  delete(key: K): void {
    this.entries.delete(key);
  }
}
