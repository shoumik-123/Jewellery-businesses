import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Server Components fetch the API directly; nothing in the browser bundle
  // needs the internal API address, so it is not a NEXT_PUBLIC_ variable.
  env: {},
};

export default config;
