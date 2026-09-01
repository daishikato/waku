import { getDatabase, seedDatabase } from '@/lib/db';

// app/seed/route.ts becomes src/pages/_api/seed.ts, served at /seed.
// The database seeds itself on first use, so this endpoint is only here to keep
// the original's manual seeding step available.
export async function GET() {
  try {
    await seedDatabase(await getDatabase());
    return Response.json({ message: 'Database seeded successfully' });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
