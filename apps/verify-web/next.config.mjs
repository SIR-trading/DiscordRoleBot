import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Pin tracing root to the monorepo root so the standalone bundle picks up
  // workspace deps and doesn't try to infer from a parent directory's lockfile.
  outputFileTracingRoot: join(__dirname, "..", ".."),
  webpack: (config) => {
    // RainbowKit + wagmi pull in `pino-pretty` as an optional peer; mark as external.
    config.externals = [...(config.externals || []), "pino-pretty", "encoding"];
    // MetaMask SDK references React Native AsyncStorage in its source — alias it
    // to false so webpack stops emitting "Module not found" warnings in the
    // browser build.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
