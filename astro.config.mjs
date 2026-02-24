// @ts-check
import node from "@astrojs/node";
import { defineConfig, envField } from "astro/config";

/**
 * @param {Omit<Parameters<typeof envField.string>[0], 'context'|'optional'>} options
 * @returns {ReturnType<typeof envField.string>}
 */
function optionalServerString(options) {
  /** @type{Parameters<typeof envField.string>[0]} */
  const defaultArgs = {
    context: "server",
    access: "secret", // Always overwritten, but the types don't check without this.
    optional: true,
  };
  return envField.string(Object.assign(defaultArgs, options));
}

/**
 * @param {Omit<Parameters<typeof envField.string>[0], 'context'|'access'>} options
 * @returns {ReturnType<typeof envField.string>}
 */
function clientString(options) {
  /** @type{Parameters<typeof envField.string>[0]} */
  const defaultArgs = {
    context: "client",
    access: "public",
  };
  return envField.string(Object.assign(defaultArgs, options));
}

// https://astro.build/config
export default defineConfig({
  output: "server",

  adapter: node({
    mode: "standalone",
  }),

  site: "http://localhost:4321",

  security: {
    allowedDomains: [{ protocol: "https", hostname: "tag-github-bot.w3.org" }],
  },

  env: {
    schema: {
      // Names for TAG repositories. These are variables so that development instances can
      // override them.
      TAG_ORG: clientString({ default: "w3ctag" }),
      REVIEWS_REPO: clientString({ default: "design-reviews" }),
      PRIVATE_BRAINSTORMING_REPO: clientString({
        default: "design-reviews-private-brainstorming",
      }),
      MEETINGS_REPO: clientString({ default: "meetings" }),

      // These are all defined in the Github App registration. The environment must set these or
      // GITHUB_TOKEN, below.
      APP_ID: optionalServerString({ access: "public" }),
      PRIVATE_KEY: optionalServerString({ access: "secret" }),
      CLIENT_ID: optionalServerString({ access: "public" }),
      CLIENT_SECRET: optionalServerString({ access: "secret" }),

      // Technically optional when testing the non-webhook parts of the server, but easy enough to
      // give a fake value.
      WEBHOOK_SECRET: envField.string({
        context: "server",
        access: "secret",
      }),

      // Use a personal token to test the server without registering it as a whole app.
      GITHUB_TOKEN: optionalServerString({ access: "secret" }),
    },
  },
});
