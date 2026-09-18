import { getDatabase, seedDatabase } from '@/lib/db';
import { auth } from '@/lib/session';

// app/seed/route.ts becomes src/pages/_api/seed.ts, served at /seed.
// The database seeds itself on first use, so this endpoint is only here to keep
// the original's manual seeding step available.
export async function GET() {
  if (!(await auth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await seedDatabase(await getDatabase());
    return Response.json({ message: 'Database seeded successfully' });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
