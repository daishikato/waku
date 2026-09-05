import type { ReactNode } from "react";
import Footer from "components/layout/footer";

export default async function Layout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <div className="w-full">
        <div className="mx-8 max-w-2xl py-20 sm:mx-auto">{children}</div>
      </div>
      <Footer />
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
