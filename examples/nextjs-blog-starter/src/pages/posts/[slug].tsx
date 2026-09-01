import type { PageProps } from "waku/router";
import { unstable_notFound as notFound } from "waku/router/server";
import Alert from "@/components/alert";
import Container from "@/components/container";
import Header from "@/components/header";
import { PostBody } from "@/components/post-body";
import { PostHeader } from "@/components/post-header";
import { getAllPosts, getPostBySlug } from "@/lib/api";
import { CMS_NAME } from "@/lib/constants";
import markdownToHtml from "@/lib/markdownToHtml";

// The `slug` prop comes from the [slug] segment in the file name, the same way
// Next.js passes `params.slug` — but it arrives as a plain prop, already resolved.
export default async function Post({ slug }: PageProps<"/posts/[slug]">) {
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const content = await markdownToHtml(post.content || "");
  const title = `${post.title} | Next.js Blog Example with ${CMS_NAME}`;

  return (
    <main>
      {/* generateMetadata() has no counterpart: render the tags with the page. */}
      <title>{title}</title>
      <meta property="og:title" content={title} />
      <meta property="og:image" content={post.ogImage.url} />
      <Alert preview={post.preview} />
      <Container>
        <Header />
        <article className="mb-32">
          <PostHeader
            title={post.title}
            coverImage={post.coverImage}
            date={post.date}
            author={post.author}
          />
          <PostBody content={content} />
        </article>
      </Container>
    </main>
  );
}

// generateStaticParams() becomes the `staticPaths` field of getConfig().
export const getConfig = async () => {
  const posts = getAllPosts();

  return {
    render: "static",
    staticPaths: posts.map((post) => post.slug),
  } as const;
};
