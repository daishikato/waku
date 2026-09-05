import type { ReactNode } from "react";
import Footer from "@/components/footer";
import { ThemeSwitcher } from "@/components/theme-switcher";
import "@/globals.css";

// The `metadata` export of app/layout.tsx becomes plain tags: Waku hoists any
// <title>, <meta> and <link> it finds in a page or layout into the document head.
//
// Note the split from the Next.js original: layout and page metadata do NOT
// merge in Waku. Every tag rendered here is emitted *in addition* to the page's
// own tags, and for <title> the first one in the document wins. So only the tags
// that are genuinely global live here; the title, description and og:image moved
// to the individual pages.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/favicon/apple-touch-icon.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="/favicon/favicon-32x32.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href="/favicon/favicon-16x16.png"
      />
      <link rel="manifest" href="/favicon/site.webmanifest" />
      <link
        rel="mask-icon"
        href="/favicon/safari-pinned-tab.svg"
        color="#000000"
      />
      <link rel="shortcut icon" href="/favicon/favicon.ico" />
      <meta name="msapplication-TileColor" content="#000000" />
      <meta name="msapplication-config" content="/favicon/browserconfig.xml" />
      <meta name="theme-color" content="#000" />
      <ThemeSwitcher />
      <div className="min-h-screen">{children}</div>
      <Footer />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: "static",
  } as const;
};
