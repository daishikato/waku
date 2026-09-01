import type { PageProps } from 'waku/router';
import { Photo } from '../../components/photo';

export default async function PhotoPage({ id }: PageProps<'/photos/[id]'>) {
  return <Photo id={id} />;
}

// `export const dynamicParams = false` plus generateStaticParams() becomes a
// static render with an explicit list of paths: anything outside it is a 404.
export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: ['1', '2', '3', '4', '5', '6'],
  } as const;
};
