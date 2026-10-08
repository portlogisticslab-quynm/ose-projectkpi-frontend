/** @type {import('next').NextConfig} */
// V3.8.1b-HF3
// - Default (LAN / laptop): "npm run build" + "npm run start"; /api/* is forwarded to the local FastAPI backend.
// - Cloudflare Pages: set NEXT_OUTPUT=export (DEPLOY_PAGES_V381B.ps1 does this) -> static site in "out/".
//   On Pages, /api/* is handled by functions/api/[[path]].js, which forwards to the Render backend.
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig = isStaticExport
  ? {
      reactStrictMode: true,
      output: "export",
      images: { unoptimized: true }
    }
  : {
      reactStrictMode: true,
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${BACKEND_INTERNAL_URL}/api/:path*` }];
      },
      experimental: { proxyTimeout: 300000 }
    };

export default nextConfig;
