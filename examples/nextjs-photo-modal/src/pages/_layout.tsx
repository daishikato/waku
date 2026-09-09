import type { ReactNode } from 'react';
import { Feed } from '../components/feed';
import { HydrationMarker } from '../components/hydration-marker';

// This layout is where the Next.js parallel route goes.
//
// The original renders two slots side by side:
//
//   <body>
//     {props.children}   // the feed at "/", the photo page at "/photos/1"
//     {props.modal}      // filled by app/@modal/(.)photos/[id] on soft navigation
//   </body>
//
// Waku has no parallel routes and no intercepting routes. What it does have is
// layout persistence: navigating from "/" to "/photos/1" swaps the page element
// but keeps this layout — and everything it renders — mounted. So the feed moves
// up into the layout and the photo route renders only the overlay, which
// reproduces the original's soft-navigation behaviour with plain routing.
export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HydrationMarker />
      <Feed />
      {children}
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
