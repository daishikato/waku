import { Suspense } from 'react';
import CardWrapper from '@/ui/dashboard/cards';
import LatestInvoices from '@/ui/dashboard/latest-invoices';
import RevenueChart from '@/ui/dashboard/revenue-chart';
import { lusitana } from '@/ui/fonts';
import {
  CardsSkeleton,
  LatestInvoicesSkeleton,
  RevenueChartSkeleton,
} from '@/ui/skeletons';

// The original lives in a (overview) route group so that loading.tsx applies to
// this page alone. Waku has route groups too, but no loading.tsx: the streaming
// fallbacks below are the whole mechanism, so the group has nothing left to do.
export default async function Page() {
  return (
    <main>
      <title>Dashboard | Acme Dashboard</title>
      <h1 className={`${lusitana.className} mb-4 text-xl md:text-2xl`}>
        Dashboard
      </h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<CardsSkeleton />}>
          <CardWrapper />
        </Suspense>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8">
        <Suspense fallback={<RevenueChartSkeleton />}>
          <RevenueChart />
        </Suspense>
        <Suspense fallback={<LatestInvoicesSkeleton />}>
          <LatestInvoices />
        </Suspense>
      </div>
    </main>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
