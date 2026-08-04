import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) || "Limitless-stats";
const basePath = githubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: githubPages ? "export" : undefined,
  basePath,
  trailingSlash: githubPages,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  typedRoutes: true,
  experimental: {
    // O checker CLI do Next 16.3 não interpreta --showConfig corretamente no
    // Node 24 deste projeto. TypeScript 5.9 ainda oferece a API completa.
    useTypeScriptCli: false,
  },
  images: {
    unoptimized: githubPages,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/**",
      },
    ],
  },
};

export default nextConfig;
