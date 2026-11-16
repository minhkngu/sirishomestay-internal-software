import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Nhập Excel gửi file/dòng dữ liệu qua server action (mặc định chỉ 1MB)
    serverActions: { bodySizeLimit: '12mb' },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
