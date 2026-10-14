import type { INestApplicationContext } from '@nestjs/common';
import type { Db } from 'mongodb';
import { Collections } from '../../../src/database/mongo/collections';
import { MONGO_DB } from '../../../src/database/mongo.tokens';

/** Empties the test MongoDB collections (database flygo_test only). */
export async function resetMongo(app: INestApplicationContext): Promise<Db> {
  const db = app.get<Db>(MONGO_DB);
  if (db.databaseName !== 'flygo_test')
    throw new Error(`Refusing to clear Mongo database ${db.databaseName}`);
  await Promise.all(Object.values(Collections).map((c) => db.collection(c).deleteMany({})));
  return db;
}

interface MailpitSearch {
  messages_count: number;
  messages: { ID: string; Subject: string; To: { Address: string }[] }[];
}

/** Finds messages in the local Mailpit by subject text (read-only — never clears the inbox). */
export async function mailpitSearch(subjectText: string): Promise<MailpitSearch> {
  const port = process.env.MAILPIT_UI_PORT ?? '8025';
  const res = await fetch(
    `http://localhost:${port}/api/v1/search?query=${encodeURIComponent(`subject:"${subjectText}"`)}`,
  );
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  return (await res.json()) as MailpitSearch;
}

export async function mailpitMessage(id: string): Promise<{ Text: string; HTML: string }> {
  const port = process.env.MAILPIT_UI_PORT ?? '8025';
  return (await (await fetch(`http://localhost:${port}/api/v1/message/${id}`)).json()) as {
    Text: string;
    HTML: string;
  };
}
