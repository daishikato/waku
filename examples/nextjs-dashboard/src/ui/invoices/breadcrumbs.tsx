import { clsx } from 'clsx';
import type { ComponentProps } from 'react';
import { Link } from 'waku';
import { lusitana } from '@/ui/fonts';

// waku/router does not export the type Link accepts for `to`, so borrow it.
type LinkTo = ComponentProps<typeof Link>['to'];

interface Breadcrumb {
  label: string;
  href: LinkTo;
  active?: boolean;
}

export default function Breadcrumbs({
  breadcrumbs,
}: {
  breadcrumbs: Breadcrumb[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 block">
      <ol className={clsx(lusitana.className, 'flex text-xl md:text-2xl')}>
        {breadcrumbs.map((breadcrumb, index) => (
          <li
            key={String(breadcrumb.href)}
            aria-current={breadcrumb.active}
            className={clsx(
              breadcrumb.active ? 'text-gray-900' : 'text-gray-500',
            )}
          >
            <Link to={breadcrumb.href}>{breadcrumb.label}</Link>
            {index < breadcrumbs.length - 1 ? (
              <span className="mx-3 inline-block">/</span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
