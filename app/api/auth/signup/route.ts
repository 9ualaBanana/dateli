import { NextResponse } from 'next/server';
import { getRedisClient } from '../../../../lib/redis';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || !body.email || !body.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }
  const email = String(body.email).toLowerCase();
  const password = String(body.password);
  const client = await getRedisClient();
  const key = `partner:email:${email}`;
  const existing = await client.get(key);
  if (existing) return NextResponse.json({ error: 'email already in use' }, { status: 409 });
  const passwordHash = await bcrypt.hash(password, 10);
  const partnerId = nanoid(8);
  const coupleToken = nanoid(16);
  const partner = {
    partnerId,
    coupleToken,
    email,
    displayName: body.displayName ?? null,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  // store by email and by id for convenience
  await client.set(key, JSON.stringify(partner));
  await client.set(`partner:id:${partnerId}`, JSON.stringify(partner));
  return NextResponse.json({ ok: true, partner: { partnerId, email } });
}
