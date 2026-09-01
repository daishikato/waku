import Grid from "components/grid";
import ProductGridItems from "components/layout/product-grid-items";
import { defaultSort, sorting } from "lib/constants";
import { getProducts } from "lib/shopify";
import type { PageProps } from "waku/router";

export default async function SearchPage({ query }: PageProps<"/search">) {
  // Next.js parses searchParams for the page; Waku passes the raw query string.
  const searchParams = new URLSearchParams(query);
  const sort = searchParams.get("sort") ?? undefined;
  const searchValue = searchParams.get("q") ?? undefined;
  const { sortKey, reverse } =
    sorting.find((item) => item.slug === sort) || defaultSort;

  const products = await getProducts({ sortKey, reverse, query: searchValue });
  const resultsText = products.length > 1 ? "results" : "result";

  return (
    <>
      <title>Search | {process.env.SITE_NAME || "Acme Store"}</title>
      <meta name="description" content="Search for products in the store." />
      {searchValue ? (
        <p className="mb-4">
          {products.length === 0
            ? "There are no products that match "
            : `Showing ${products.length} ${resultsText} for `}
          <span className="font-bold">&quot;{searchValue}&quot;</span>
        </p>
      ) : null}
      {products.length > 0 ? (
        <Grid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <ProductGridItems products={products} />
        </Grid>
      ) : null}
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
