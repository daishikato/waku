import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { customers, invoices, revenue, users } from './placeholder-data';

// The Next.js original talks to a hosted Postgres through the `postgres`
// package:
//
//   const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
//
// This example runs Postgres in-process with PGlite so it needs no credentials,
// and exposes the same tagged-template call signature. Every query in data.ts
// and actions.ts is therefore unchanged; only the import line moved.
//
// Point a real database at it by replacing this file — nothing else in the app
// knows which one it is talking to.

type Row = Record<string, any>;

export interface Sql {
  <T extends Row = Row>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
}

let dbPromise: Promise<PGlite> | undefined;

const getDb = () =>
  (dbPromise ??= (async () => {
    // PGLITE_DATA_DIR persists the database on disk; unset means in-memory,
    // reseeded on every start.
    const db = new PGlite(process.env.PGLITE_DATA_DIR);
    await seedDatabase(db);
    return db;
  })());

// `strings` has one member more than `values`, so this starts from the first
// literal and interleaves $1, $2, ... between the rest.
const toPlaceholders = (strings: TemplateStringsArray) =>
  strings.reduce((acc, part, i) => acc + '$' + i + part);

export const sql: Sql = async <T extends Row>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> => {
  const db = await getDb();
  const result = await db.query<T>(toPlaceholders(strings), values);
  return result.rows;
};

const seeded = new WeakSet<PGlite>();

export const seedDatabase = async (db: PGlite) => {
  if (seeded.has(db)) {
    return;
  }
  seeded.add(db);

  // uuid_generate_v4() comes from the uuid-ossp extension, which PGlite does
  // not bundle; gen_random_uuid() is built into Postgres 13+ and equivalent here.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      image_url VARCHAR(255) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      customer_id UUID NOT NULL,
      amount INT NOT NULL,
      status VARCHAR(255) NOT NULL,
      date DATE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS revenue (
      month VARCHAR(4) NOT NULL UNIQUE,
      revenue INT NOT NULL
    );
  `);

  for (const user of users) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    await db.query(
      `INSERT INTO users (id, name, email, password)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [user.id, user.name, user.email, hashedPassword],
    );
  }
  for (const customer of customers) {
    await db.query(
      `INSERT INTO customers (id, name, email, image_url)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [customer.id, customer.name, customer.email, customer.image_url],
    );
  }
  // Invoices have no natural key to conflict on, so skip them if the table is
  // already populated (relevant when PGLITE_DATA_DIR persists the database).
  const [existing] = (
    await db.query<{ count: string }>('SELECT COUNT(*) AS count FROM invoices')
  ).rows;
  if (Number(existing?.count ?? '0') > 0) {
    return;
  }

  for (const invoice of invoices) {
    await db.query(
      `INSERT INTO invoices (customer_id, amount, status, date)
       VALUES ($1, $2, $3, $4)`,
      [invoice.customer_id, invoice.amount, invoice.status, invoice.date],
    );
  }
  for (const rev of revenue) {
    await db.query(
      `INSERT INTO revenue (month, revenue)
       VALUES ($1, $2) ON CONFLICT (month) DO NOTHING`,
      [rev.month, rev.revenue],
    );
  }
};

export const getDatabase = getDb;
