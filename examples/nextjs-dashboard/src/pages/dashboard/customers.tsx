import type { PageProps } from 'waku/router';
import CustomersTable from '@/ui/customers/table';
import { fetchFilteredCustomers } from '@/lib/data';

// Next.js passes a parsed `searchParams` object; Waku passes the raw query
// string as `query`, so the page parses it itself.
export default async function Page({ query }: PageProps<'/dashboard/customers'>) {
  const searchParams = new URLSearchParams(query);
  const search = searchParams.get('query') || '';

  const customers = await fetchFilteredCustomers(search);

  return (
    <main>
      <title>Customers | Acme Dashboard</title>
      <CustomersTable customers={customers} />
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
