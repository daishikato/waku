import type { PageProps } from 'waku/router';
import { unstable_notFound as notFound } from 'waku/router/server';
import { fetchCustomers, fetchInvoiceById } from '@/lib/data';
import Breadcrumbs from '@/ui/invoices/breadcrumbs';
import Form from '@/ui/invoices/edit-form';

export default async function Page({
  id,
}: PageProps<'/dashboard/invoices/[id]/edit'>) {
  const [invoice, customers] = await Promise.all([
    fetchInvoiceById(id),
    fetchCustomers(),
  ]);

  if (!invoice) {
    // Next.js resolves this against the nearest not-found.tsx; Waku answers
    // every notFound() with src/pages/404.tsx.
    notFound();
  }

  return (
    <main>
      <title>Edit Invoice | Acme Dashboard</title>
      <Breadcrumbs
        breadcrumbs={[
          { label: 'Invoices', href: '/dashboard/invoices' },
          {
            label: 'Edit Invoice',
            href: `/dashboard/invoices/${id}/edit`,
            active: true,
          },
        ]}
      />
      <Form invoice={invoice} customers={customers} />
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
