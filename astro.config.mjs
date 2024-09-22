// @ts-check
import { defineConfig, envField } from "astro/config";

import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",

  adapter: node({
    mode: "standalone",
  }),

  experimental: {
    env: {
      schema: {
        // owner/reponame for the design-reviews repository.
        REVIEWS_REPO: envField.string({
          context: "client",
          access: "public",
          default: "w3ctag/design-reviews",
        }),
        // Varies by org. Find this at the end of the 'Configure' link
        // https://github.com/<org>/<repo>/settings/installations.
        INSTALLATION_ID: envField.number({
          context: "server",
          access: "public",
        }),
        APP_ID: envField.string({ context: "server", access: "public" }),
        PRIVATE_KEY: envField.string({ context: "server", access: "secret" }),
        CLIENT_ID: envField.string({ context: "server", access: "public" }),
        CLIENT_SECRET: envField.string({ context: "server", access: "secret" }),
        WEBHOOK_SECRET: envField.string({
          context: "server",
          access: "secret",
        }),
      },
    },
  },
});
