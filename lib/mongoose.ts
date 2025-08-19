import mongoose from 'mongoose';

const cached: { conn?: mongoose.Connection } = {};

export async function connectToDatabase(uri?: string) {
  const mongoUri = uri ?? process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI not set');
  if (cached.conn) return cached.conn;
  const conn = await mongoose.connect(mongoUri);
  cached.conn = conn.connection;
  return conn;
}
