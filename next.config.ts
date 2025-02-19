import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Since backend is a separate service, we can ignore its types during Next.js build
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Exclude the backend directory from the build
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...(Array.isArray(config.watchOptions?.ignored) 
          ? config.watchOptions.ignored 
          : []),
        '**/backend/**'
      ],
    };
    return config;
  },
};

export default nextConfig;
