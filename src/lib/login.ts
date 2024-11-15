import type {
  GitHubAppUserAuthentication,
  GitHubAppUserAuthenticationWithExpiration,
} from "@octokit/auth-oauth-app";
import type { Prisma } from "@prisma/client";
import type { AstroCookies } from "astro";
import crypto from "node:crypto";
import util from "node:util";
import { app } from "./github/auth";
import { prisma } from "./prisma";

// Can't use __Host- because of https://crbug.com/40196122.
const LOGIN_COOKIE_NAME = "Session";

const randomBytes = util.promisify(crypto.randomBytes);

export type User = {
  /** The active user's GraphQL node ID. */
  githubId: string;
  username: string;
};

type GithubRestApiUser = {
  login: string;
  /** GraphQL ID */
  node_id: string;
};

export async function finishLogin(
  cookies: AstroCookies,
  { login, node_id }: GithubRestApiUser,
  {
    token,
    refreshToken,
    expiresAt,
    refreshTokenExpiresAt,
  }: GitHubAppUserAuthentication &
    Partial<GitHubAppUserAuthenticationWithExpiration>,
) {
  const sessionId = (await randomBytes(128 / 8)).toString("base64url");
  const sessionExpires = new Date();
  sessionExpires.setDate(sessionExpires.getDate() + 31);
  const update: Omit<Prisma.GithubUserCreateInput, "id"> = {
    username: login,
    accessToken: token,
    accessTokenExpires: expiresAt,
    refreshToken,
    refreshTokenExpires: refreshTokenExpiresAt,
    sessions: { create: { id: sessionId, expires: sessionExpires } },
  };
  await prisma.githubUser.upsert({
    where: { id: node_id },
    create: {
      id: node_id,
      ...update,
    },
    update,
  });
  cookies.set(LOGIN_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: true,
    path: "/",
    expires: sessionExpires,
  });
}

export async function getLogin(cookies: AstroCookies): Promise<User | null> {
  const sessionId = cookies.get(LOGIN_COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  const now = new Date();
  if (session.expires < now) {
    void prisma.session
      .deleteMany({
        where: { expires: { lte: now } },
      })
      .catch((e: unknown) => {
        console.error(e instanceof Error ? e.stack : e);
      });
    cookies.delete(LOGIN_COOKIE_NAME, { path: "/" });
    return null;
  }
  return { githubId: session.user.id, username: session.user.username };
}

export async function logout(cookies: AstroCookies): Promise<void> {
  const sessionId = cookies.get(LOGIN_COOKIE_NAME)?.value;
  if (!sessionId) return;
  const { user } = await prisma.session.delete({
    where: { id: sessionId },
    include: { user: true },
  });
  cookies.delete(LOGIN_COOKIE_NAME);
  if (user.accessToken) {
    await app?.oauth.deleteToken({ token: user.accessToken });
  }
  await prisma.githubUser.update({
    where: { id: user.id },
    data: {
      accessToken: null,
      accessTokenExpires: null,
      refreshToken: null,
      refreshTokenExpires: null,
    },
  });
}
