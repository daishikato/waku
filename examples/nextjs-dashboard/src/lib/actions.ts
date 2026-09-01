'use server';

import { z } from 'zod';
import {
  unstable_redirect as redirect,
  unstable_rerenderRoute as rerenderRoute,
} from 'waku/router/server';
import { sql } from './db';
import { signIn } from './session';

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ date: true, id: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  // Validate form fields using Zod
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  // Prepare data for insertion into the database
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  // Insert data into the database
  try {
    await sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    // If a database error occurs, return a more specific error.
    return {
      message: 'Database Error: Failed to Create Invoice.',
    };
  }

  // revalidatePath() has no counterpart: Waku caches nothing, so the redirect
  // below simply renders the invoices page again with fresh data.
  redirect('/dashboard/invoices');
}

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  try {
    await sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    return { message: 'Database Error: Failed to Update Invoice.' };
  }

  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string, searchParams = '') {
  await sql`DELETE FROM invoices WHERE id = ${id}`;
  // revalidatePath('/dashboard/invoices') becomes unstable_rerenderRoute. An
  // action that ends in redirect() does not need this, but this one stays on the
  // page, and nothing refreshes on its own: without the call the row is gone
  // from the database and still on screen until the next navigation.
  //
  // The current query string has to be passed along, because the route the
  // client is showing is the path *and* its search params.
  rerenderRoute('/dashboard/invoices', searchParams);
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const redirectTo = String(formData.get('redirectTo') || '');

  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(6) })
    .safeParse({ email, password });
  if (!parsed.success) {
    return 'Invalid credentials.';
  }

  if (!(await signIn(parsed.data.email, parsed.data.password))) {
    return 'Invalid credentials.';
  }

  // next-auth accepted any redirectTo string. Waku's redirect() is typed against
  // the app's routes, which forces the callback URL to be matched against a
  // known list — worth doing anyway, since an unchecked one is an open redirect.
  const allowed = [
    '/dashboard',
    '/dashboard/invoices',
    '/dashboard/customers',
  ] as const;
  redirect(allowed.find((route) => route === redirectTo) ?? '/dashboard');
}
