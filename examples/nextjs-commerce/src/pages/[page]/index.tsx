import Prose from "components/prose";
import { getPage } from "lib/shopify";
import { unstable_notFound as notFound } from "waku/router/server";
import type { PageProps } from "waku/router";

export default async function Page({ page: handle }: PageProps<"/[page]">) {
  const page = await getPage(handle);

  if (!page) return notFound();

  return (
    <>
      <title>{page.seo?.title || page.title}</title>
      <meta
        name="description"
        content={page.seo?.description || page.bodySummary}
      />
      <meta property="og:type" content="article" />
      <meta property="article:published_time" content={page.createdAt} />
      <meta property="article:modified_time" content={page.updatedAt} />
      <h1 className="mb-8 text-5xl font-bold">{page.title}</h1>
      <Prose className="mb-8" html={page.body} />
      <p className="text-sm italic">
        {`This document was last updated on ${new Intl.DateTimeFormat(
          undefined,
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          },
        ).format(new Date(page.updatedAt))}.`}
      </p>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
