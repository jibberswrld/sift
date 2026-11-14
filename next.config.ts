import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local tests) ships WASM + data files and pg has optional native bindings: load both from node_modules.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // db/schema.sql is read at runtime, so it has to ship with the server functions.
  outputFileTracingIncludes: { "/**": ["./db/schema.sql"] },
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
