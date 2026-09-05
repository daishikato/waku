'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { ComponentProps } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Link, useRouter } from 'waku';

// Search is rendered on more than one route, so its target is only known at
// runtime. Waku's typed routes reject a computed string, and there is no
// published type for "some route href", so it is borrowed from <Link> and the
// cast is made explicit here rather than being spread over the call sites.
type RouteHref = Extract<ComponentProps<typeof Link>['to'], string>;

// next/navigation's usePathname(), useSearchParams() and useRouter() collapse
// into Waku's single useRouter(): `path` is the pathname and `query` is the raw
// query string, which URLSearchParams parses.
export default function Search({ placeholder }: { placeholder: string }) {
  const { path, query, replace } = useRouter();
  const searchParams = new URLSearchParams(query);

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(query);

    params.set('page', '1');

    if (term) {
      params.set('query', term);
    } else {
      params.delete('query');
    }
    replace(`${path}?${params.toString()}` as RouteHref);
  }, 300);

  return (
    <div className="relative flex flex-1 flex-shrink-0">
      <label htmlFor="search" className="sr-only">
        Search
      </label>
      <input
        className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm outline-2 placeholder:text-gray-500"
        placeholder={placeholder}
        onChange={(e) => {
          handleSearch(e.target.value);
        }}
        defaultValue={searchParams.get('query')?.toString()}
      />
      <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900" />
    </div>
  );
}
