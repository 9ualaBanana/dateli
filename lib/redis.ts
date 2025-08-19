import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client && client.isOpen) return client;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL not set');
  client = createClient({ url });
  client.on('error', (err: unknown) => console.error('Redis Client Error', err));
  await client.connect();
  return client;
}
