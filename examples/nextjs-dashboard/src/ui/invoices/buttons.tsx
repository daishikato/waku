'use client';

import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Link, useRouter } from 'waku';
import { deleteInvoice } from '@/lib/actions';

export function CreateInvoice() {
  return (
    <Link
      to="/dashboard/invoices/create"
      className="flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <span className="hidden md:block">Create Invoice</span>{' '}
      <PlusIcon className="h-5 md:ml-4" />
    </Link>
  );
}

export function UpdateInvoice({ id }: { id: string }) {
  return (
    <Link
      to={{ to: '/dashboard/invoices/[id]/edit', params: { id } }}
      className="rounded-md border p-2 hover:bg-gray-100"
    >
      <PencilIcon className="w-5" />
    </Link>
  );
}

export function DeleteInvoice({ id }: { id: string }) {
  const router = useRouter();
  const deleteInvoiceWithId = deleteInvoice.bind(null, id);

  return (
    <form
      action={async () => {
        await deleteInvoiceWithId();
        // Waku re-renders nothing after an action that does not redirect. The
        // server-side unstable_rerenderRoute() exists for this, but the client
        // drops its result whenever the layout slot happens to stream before
        // the page slot (wakujs/waku#2288), so the button
        // refetches the route itself instead.
        router.reload();
      }}
    >
      <button type="submit" className="rounded-md border p-2 hover:bg-gray-100">
        <span className="sr-only">Delete</span>
        <TrashIcon className="w-5" />
      </button>
    </form>
  );
}
