import { NavRouter } from '../nav-binding.js';

// mix-budget-a as a document request would HTTP-redirect. this root run()s
// locally so the load-time 404 hops cannot hang the owning Navigation API.
export default function MixBudgetPage({ query = '' }: { query?: string }) {
  const sameQuery = new URLSearchParams(query).has('same');
  return (
    <div>
      <p data-testid="mix-budget">mix budget</p>
      <div data-testid="mix-budget-host">
        <NavRouter
          ownsNavigation={false}
          initialRoute={{
            path: '/mix-budget-a',
            query: sameQuery ? 'mixcycle=same' : '',
            hash: '',
          }}
        />
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
