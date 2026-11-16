import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.AUTH_HTTP_TEST === "1" ? ".local/next-auth-test" : ".next",
};
export default config;
