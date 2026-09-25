// next/font/google downloads, self-hosts and preloads the families. The
// equivalent without a framework font loader is the @fontsource package for each
// family, imported once from global.css and wired up as Tailwind font families
// (see tailwind.config.ts). Everything that read `.className` keeps working.
export const inter = { className: 'font-inter' };

export const lusitana = { className: 'font-lusitana' };
