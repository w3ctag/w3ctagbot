/// <reference types="vitest" />
import { getViteConfig, type ViteUserConfigFn } from "astro/config";

const config: ViteUserConfigFn = getViteConfig({
  test: {},
});

export default config;
