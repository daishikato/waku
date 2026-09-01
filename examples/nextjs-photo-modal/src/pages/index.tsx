// The feed itself lives in _layout.tsx so that it survives navigation to a
// photo. This page is the "/" route with nothing left to add — the counterpart
// of the original's app/default.tsx.
export default async function Page() {
  return null;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
