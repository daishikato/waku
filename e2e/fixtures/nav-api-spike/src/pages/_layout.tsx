import type { ReactNode } from 'react';
import { SearchCodecs } from '../components/search-codecs.js';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SearchCodecs>
      <div>
        <title>nav-api-spike</title>
        <nav>
          <a href="/" data-testid="go-home">
            Home
          </a>
          <a href="/hello/spike" data-testid="go-hello">
            Hello
          </a>
          <a href="/search?q=hi" data-testid="go-search">
            Search
          </a>
          <a href="/with-slice" data-testid="go-slice">
            Slice
          </a>
          <a href="/missing" data-testid="go-missing">
            Missing
          </a>
        </nav>
        {children}
      </div>
    </SearchCodecs>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
