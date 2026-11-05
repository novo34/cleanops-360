import { securityHeaders } from "./lib/security-headers"

// Opt-in BUILD-TIME prefix for the isolated B1 candidate only.
// The original web keeps its existing /_next/static URLs by default.
// This never selects a backend or enables authentication.
const b1AssetPrefix = process.env.CLEANOPS_B1_ASSET_PREFIX
if (b1AssetPrefix && b1AssetPrefix !== "/b1-static") {
  throw new Error("B1_ASSET_PREFIX_INVALID")
}

const nextConfig = {
  ...(b1AssetPrefix ? { assetPrefix: b1AssetPrefix } : {}),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
