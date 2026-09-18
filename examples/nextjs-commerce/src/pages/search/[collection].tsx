import { getCollection, getCollectionProducts } from "lib/shopify";
import type { PageProps } from "waku/router";

import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { defaultSort, sorting } from "lib/constants";

export default async function CategoryPage({
  collection: handle,
  query,
}: PageProps<"/search/[collection]">) {
  const collection = await getCollection(handle);
  const sort = new URLSearchParams(query).get("sort") ?? undefined;
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;
  const products = await getCollectionProducts({
    collection: handle,
    sortKey,
    reverse,
  });

  return (
    <section>
      <title>
        {(collection?.seo?.title || collection?.title) ?? "Collection"}
      </title>
      <meta
        name="description"
        content={
          collection?.seo?.description ||
          collection?.description ||
          `${collection?.title ?? handle} products`
        }
      />
      {products.length === 0 ? (
        <p className="py-3 text-lg">{`No products found in this collection`}</p>
      ) : (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      )}
    </section>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
