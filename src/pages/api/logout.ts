import type { APIRoute } from "astro";
import { logout } from "../../lib/login";

export const GET: APIRoute = async ({ url, cookies, redirect, site }) => {
  await logout(cookies);
  const next = url.searchParams.get("next") ?? "/";
  let nextUrl: URL;
  try {
    nextUrl = new URL(next, site);
  } catch (e) {
    return redirect("/", 303);
  }
  // Only redirect within this site.
  return redirect(nextUrl.pathname + nextUrl.search, 303);
};
