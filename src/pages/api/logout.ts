import type { APIRoute } from "astro";
import { logout } from "../../lib/login";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  await logout(cookies);
  const next = url.searchParams.get("next") ?? "/";
  return redirect(next, 303);
};
