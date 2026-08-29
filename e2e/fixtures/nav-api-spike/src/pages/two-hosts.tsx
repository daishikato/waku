import { NavRouter } from '../nav-binding.js';

export default function TwoHostsPage() {
  return (
    <div>
      <p data-testid="two-hosts">two hosts</p>
      <a href="/canonical?v=old" data-testid="go-canonical-from-two-hosts">
        canonical old
      </a>
      <div data-testid="second-host">
        <NavRouter
          ownsNavigation={false}
          initialRoute={{ path: '/bounce', query: 'v=a', hash: '' }}
        />
      </div>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
