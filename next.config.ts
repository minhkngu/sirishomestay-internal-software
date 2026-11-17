import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/*': ['./src/server/pdf/fonts/*.ttf', './node_modules/pdfkit/js/standard-fonts/**/*.cjs'] },
  experimental: {
    // Nhập Excel gửi file/dòng dữ liệu qua server action (mặc định chỉ 1MB)
    serverActions: { bodySizeLimit: '12mb' },
  },
  webpack(config) {
    config.module.rules.push({ test: /globals\.css$/, use: [{ loader: '@tailwindcss/turbopack' }] })
    return config
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
