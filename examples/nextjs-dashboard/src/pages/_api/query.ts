import { sql } from '@/lib/db';
import { auth } from '@/lib/session';

async function listInvoices() {
  const data = await sql`
    SELECT invoices.amount, customers.name
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE invoices.amount = 666;
  `;

  return data;
}

export async function GET() {
  // An API route is outside every layout, and this one talks to the database
  // directly rather than through data.ts, so it has to check for itself. The
  // Next.js original was covered by middleware; see src/lib/session.ts.
  if (!(await auth())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return Response.json(await listInvoices());
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
