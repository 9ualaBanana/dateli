import { NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { SuggestionSchema } from '@/lib/schemas';
import { uid } from '@/lib/uid';

const LIST_KEY = 'suggestions:list';

export async function GET() {
  const client = await getRedisClient();
  const ids = await client.lRange(LIST_KEY, 0, -1);
  const multi = client.multi();
  ids.forEach((id: string) => multi.get(`suggestion:${id}`));
  const res = await multi.exec();
  const suggestions = (res ?? []).map((r: unknown) => r as string).filter(Boolean).map((s: string) => JSON.parse(s));
  return NextResponse.json(suggestions);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = SuggestionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 422 });
  const client = await getRedisClient();
  const id = uid();
  // if tags weren't supplied on the suggestion, try to copy tags from the idea
  let tags = parsed.data.tags;
  if ((!tags || tags.length === 0) && parsed.data.ideaId) {
    const ideaRaw = await client.get(`idea:${parsed.data.ideaId}`);
    if (ideaRaw) {
      try {
        const idea = JSON.parse(ideaRaw) as { tags?: string[] };
        if (Array.isArray(idea.tags) && idea.tags.length) tags = idea.tags;
      } catch {
        // ignore parse errors
      }
    }
  }
  const payload = { id, ...parsed.data, tags };
  await client.set(`suggestion:${id}`, JSON.stringify(payload));
  await client.rPush(LIST_KEY, id);
  return NextResponse.json(payload, { status: 201 });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const client = await getRedisClient();
  const key = `suggestion:${body.id}`;
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
  const key = `suggestion:${body.id}`;
  const existing = await client.get(key);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await client.del(key);
  try { await client.lRem(LIST_KEY, 0, body.id); } catch {}
  return NextResponse.json({ ok: true });
}
