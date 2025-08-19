import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { IdeaSchema } from '@/lib/schemas';
import { uid } from '@/lib/uid';

const LIST_KEY = 'ideas:list';

export async function GET() {
  const client = await getRedisClient();
  const ids = await client.lRange(LIST_KEY, 0, -1);
  const multi = client.multi();
  ids.forEach((id: string) => multi.get(`idea:${id}`));
  const res = await multi.exec();
  const ideas = (res ?? []).map((r: unknown) => r as string).filter(Boolean).map((s: string) => JSON.parse(s));
  return NextResponse.json(ideas);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = IdeaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
  const client = await getRedisClient();
  const id = uid();
  const payload = { id, ...parsed.data };
  await client.set(`idea:${id}`, JSON.stringify(payload));
  await client.rPush(LIST_KEY, id);
  return NextResponse.json(payload, { status: 201 });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const client = await getRedisClient();
  const key = `idea:${body.id}`;
  const existing = await client.get(key);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const updated = { ...JSON.parse(existing), ...body };
  await client.set(key, JSON.stringify(updated));
  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const client = await getRedisClient();
  const key = `idea:${body.id}`;
  const existing = await client.get(key);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // delete the idea key and remove from list
  await client.del(key);
  try {
    // remove all occurrences of the id from the list
    // lRem(list, count, value) - count 0 removes all
    await client.lRem(LIST_KEY, 0, body.id);
  } catch {
    // ignore if lRem not supported
  }
  return NextResponse.json({ ok: true });
}
