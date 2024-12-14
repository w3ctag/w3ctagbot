/// <reference types="vitest" />
import { getViteConfig } from "astro/config";
import type { UserConfigFn } from "vite";

const config: UserConfigFn = getViteConfig({
  test: {},
});

export default config;
