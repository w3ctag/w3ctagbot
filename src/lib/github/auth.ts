import { Webhooks } from "@octokit/webhooks";
import {
  APP_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  GITHUB_TOKEN,
  PRIVATE_KEY,
  WEBHOOK_SECRET,
} from "astro:env/server";
import { App, Octokit } from "octokit";

export const app: App | undefined = (function () {
  if (APP_ID && CLIENT_ID && CLIENT_SECRET && PRIVATE_KEY) {
    return new App({
      appId: APP_ID,
      privateKey: PRIVATE_KEY,
      oauth: {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      },
      webhooks: {
        secret: WEBHOOK_SECRET,
      },
    });
  }
  return undefined;
})();

export const webhooks: Webhooks =
  app?.webhooks ?? new Webhooks({ secret: WEBHOOK_SECRET });

if (!app && !GITHUB_TOKEN) {
  throw new Error("Must set the App secrets or a GITHUB_TOKEN.");
}
const octokit: Octokit = app?.octokit ?? new Octokit({ auth: GITHUB_TOKEN });

// This won't work if an instance of the app is ever installed in more than 1 org. If that happens,
// we'll need to pass the relevant org into this function.
let installationId: number | undefined = undefined;
export async function installationOctokit(): Promise<Octokit> {
  if (app) {
    if (installationId) {
      return app.getInstallationOctokit(installationId);
    }
    for await (const {
      octokit,
      installation,
    } of app.eachInstallation.iterator()) {
      installationId = installation.id;
      return octokit;
    }
    throw new Error(`App isn't installed.`);
  }
  return octokit;
}
