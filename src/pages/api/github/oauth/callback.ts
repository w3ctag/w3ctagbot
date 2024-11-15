// At this path for compatibility with the octokit middleware.

import type { APIRoute } from "astro";
import { app } from "../../../../lib/github/auth";
import { finishLogin } from "../../../../lib/login";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "/";
  const next = URL.canParse(state, url.href) ? state : "/";
  if (app && code) {
    const { authentication } = await app.oauth.createToken({ code });
    const {
      data: { user },
    } = await app.oauth.checkToken({ token: authentication.token });
    if (user) {
      await finishLogin(cookies, user, authentication);
    }
  }
  return redirect(next, 303);
};
