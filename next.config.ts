import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep dev rebuilds lighter; enable only when you specifically need it.
  reactCompiler: false,
};

export default nextConfig;
