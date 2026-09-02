import { Suspense } from 'react';
import type { PageProps } from 'waku/router';
import { fetchInvoicesPages } from '@/lib/data';
import { lusitana } from '@/ui/fonts';
import { CreateInvoice } from '@/ui/invoices/buttons';
import { InvoicesErrorBoundary } from '@/ui/invoices/error-boundary';
import Pagination from '@/ui/invoices/pagination';
import Table from '@/ui/invoices/table';
import Search from '@/ui/search';
import { InvoicesTableSkeleton } from '@/ui/skeletons';

export default async function Page({ query }: PageProps<'/dashboard/invoices'>) {
  const searchParams = new URLSearchParams(query);
  const search = searchParams.get('query') || '';
  const currentPage = Number(searchParams.get('page')) || 1;

  const totalPages = await fetchInvoicesPages(search);

  return (
    <div className="w-full">
      <title>Invoices | Acme Dashboard</title>
      <div className="flex w-full items-center justify-between">
        <h1 className={`${lusitana.className} text-2xl`}>Invoices</h1>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="Search invoices..." />
        <CreateInvoice />
      </div>
      {/* error.tsx becomes an explicit error boundary around the part of the
          tree it used to cover. */}
      <InvoicesErrorBoundary>
        <Suspense key={search + currentPage} fallback={<InvoicesTableSkeleton />}>
          <Table query={search} currentPage={currentPage} />
        </Suspense>
      </InvoicesErrorBoundary>
      <div className="mt-5 flex w-full justify-center">
        <Pagination totalPages={totalPages} />
      </div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
