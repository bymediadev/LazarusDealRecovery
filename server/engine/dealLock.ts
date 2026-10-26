/**
 * Distributed deal execution lock: Redis when REDIS_URL is set, else in-process Map.
 */

type LockHandle = { key: string; token: string; via: "redis" | "memory" };

const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

let redisClient: import("ioredis").default | null | undefined;

async function getRedis(): Promise<import("ioredis").default | null> {
  if (redisClient !== undefined) return redisClient;
  const url = (process.env.REDIS_URL ?? "").trim();
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    const Redis = (await import("ioredis")).default;
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    await redisClient.connect().catch(() => undefined);
    return redisClient;
  } catch (err) {
    console.warn("dealLock: Redis unavailable, using memory locks", err);
    redisClient = null;
    return null;
  }
}

function memoryAcquire(key: string, ttlSec: number): string | null {
  const now = Date.now();
  const existing = memoryLocks.get(key);
  if (existing && existing.expiresAt > now) return null;
  const token = `${now}-${Math.random().toString(36).slice(2)}`;
  memoryLocks.set(key, { token, expiresAt: now + ttlSec * 1000 });
  return token;
}

function memoryRelease(key: string, token: string): void {
  const existing = memoryLocks.get(key);
  if (existing && existing.token === token) memoryLocks.delete(key);
}

export async function acquireDealLock(
  tenantId: string,
  dealId: string,
  ttlSec = 30
): Promise<LockHandle | null> {
  const key = `lock:deal:${tenantId}:${dealId}`;
  const redis = await getRedis();
  if (redis) {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ok = await redis.set(key, token, "EX", ttlSec, "NX");
    if (ok !== "OK") return null;
    return { key, token, via: "redis" };
  }
  const token = memoryAcquire(key, ttlSec);
  if (!token) return null;
  return { key, token, via: "memory" };
}

export async function releaseDealLock(handle: LockHandle | null | undefined): Promise<void> {
  if (!handle) return;
  if (handle.via === "redis") {
    const redis = await getRedis();
    if (!redis) return;
    const current = await redis.get(handle.key);
    if (current === handle.token) await redis.del(handle.key);
    return;
  }
  memoryRelease(handle.key, handle.token);
}
