import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { EventSchema } from '@/lib/schemas';
import { uid } from '@/lib/uid';

const LIST_KEY = 'events:list';

export async function GET() {
  const client = await getRedisClient();
  const ids = await client.lRange(LIST_KEY, 0, -1);
  const multi = client.multi();
  ids.forEach((id: string) => multi.get(`event:${id}`));
  const res = await multi.exec();
  const events = (res ?? []).map((r: unknown) => r as string).filter(Boolean).map((s: string) => JSON.parse(s));
  return NextResponse.json(events);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
  const client = await getRedisClient();
  const id = uid();
  // derive tags: prefer explicit, then suggestion, then idea
  let tags = parsed.data.tags;
  if ((!tags || tags.length === 0) && parsed.data.suggestionId) {
    const sRaw = await client.get(`suggestion:${parsed.data.suggestionId}`);
    if (sRaw) {
      try {
        const sObj = JSON.parse(sRaw) as { tags?: string[]; ideaId?: string };
        if (Array.isArray(sObj.tags) && sObj.tags.length) tags = sObj.tags;
        else if (sObj.ideaId) {
          const iRaw = await client.get(`idea:${sObj.ideaId}`);
          if (iRaw) {
            try {
              const iObj = JSON.parse(iRaw) as { tags?: string[] };
              if (Array.isArray(iObj.tags) && iObj.tags.length) tags = iObj.tags;
            } catch {}
          }
        }
      } catch {}
    }
  }
  const payload = { id, ...parsed.data, tags };
  await client.set(`event:${id}`, JSON.stringify(payload));
  await client.rPush(LIST_KEY, id);
  return NextResponse.json(payload, { status: 201 });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const client = await getRedisClient();
  const key = `event:${body.id}`;
  const existing = await client.get(key);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const updated = { ...JSON.parse(existing), ...body };
  await client.set(key, JSON.stringify(updated));
  return NextResponse.json(updated);
}
