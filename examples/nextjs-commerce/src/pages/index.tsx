import { Carousel } from 'components/carousel';
import { ThreeItemGrid } from 'components/grid/three-items';
import Footer from 'components/layout/footer';

export default function HomePage() {
  return (
    <>
      <title>{process.env.SITE_NAME || 'Acme Store'}</title>
      <meta
        name="description"
        content="High-performance ecommerce store built with Next.js, Vercel, and Shopify."
      />
      <meta property="og:type" content="website" />
      <meta property="og:image" content="/opengraph-image" />
      <ThreeItemGrid />
      <Carousel />
      <Footer />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
