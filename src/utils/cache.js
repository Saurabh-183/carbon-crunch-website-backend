import { createClient } from "redis";

let redisClient = null;
let redisReady = false;
let redisInitAttempted = false;

const memoryStore = new Map();

const getRedisClient = async () => {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (redisReady && redisClient) {
    return redisClient;
  }

  if (redisInitAttempted) {
    return null;
  }

  redisInitAttempted = true;

  try {
    redisClient = createClient({ url: process.env.REDIS_URL });

    redisClient.on("error", (err) => {
      console.error("[redis] client error:", err);
      redisReady = false;
    });

    await redisClient.connect();
    redisReady = true;
    return redisClient;
  } catch (error) {
    console.error("[redis] failed to connect:", error);
    redisReady = false;
    return null;
  }
};

export const cacheGet = async (key) => {
  const client = await getRedisClient();
  if (client && redisReady) {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
};

export const cacheSet = async (key, value, ttlMs) => {
  const client = await getRedisClient();
  const expiresAt = Date.now() + ttlMs;
  const record = { ...value, expiresAt };

  if (client && redisReady) {
    await client.setEx(key, Math.ceil(ttlMs / 1000), JSON.stringify(record));
    return;
  }

  memoryStore.set(key, record);
};
