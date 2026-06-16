// PostCSS config for Tailwind CSS v4 + Next.js 16. Tailwind v4 ships as a
// PostCSS plugin (@tailwindcss/postcss) rather than the v3 tailwindcss CLI.
// The `@import "tailwindcss"` directive in app/globals.css is interpreted by
// this plugin; without this config, Next.js can't resolve the import.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
