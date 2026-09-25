import Container from "@/components/container";
import { HeroPost } from "@/components/hero-post";
import { Intro } from "@/components/intro";
import { MoreStories } from "@/components/more-stories";
import { getAllPosts } from "@/lib/api";
import { CMS_NAME, HOME_OG_IMAGE_URL } from "@/lib/constants";

export default function Index() {
  const allPosts = getAllPosts();

  const heroPost = allPosts[0];

  const morePosts = allPosts.slice(1);

  return (
    <main>
      <title>{`Next.js Blog Example with ${CMS_NAME}`}</title>
      <meta
        name="description"
        content={`A statically generated blog example using Next.js and ${CMS_NAME}.`}
      />
      <meta property="og:image" content={HOME_OG_IMAGE_URL} />
      <Container>
        <Intro />
        <HeroPost
          title={heroPost.title}
          coverImage={heroPost.coverImage}
          date={heroPost.date}
          author={heroPost.author}
          slug={heroPost.slug}
          excerpt={heroPost.excerpt}
        />
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
    </main>
  );
}

// Next.js prerenders this page because nothing in it opts into dynamic
// rendering. Waku asks every page to say so explicitly.
export const getConfig = async () => {
  return {
    render: "static",
  } as const;
};
