import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages 部署在 https://zane0227.github.io/climber/ 子路径下
  basePath: isProd ? "/climber" : "",
  assetPrefix: isProd ? "/climber/" : "",
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 服务端把 @mediapipe/pose 替换为空模块
      config.resolve.alias = {
        ...config.resolve.alias,
        "@mediapipe/pose": false,
      };
    }
    return config;
  },
};

export default nextConfig;
