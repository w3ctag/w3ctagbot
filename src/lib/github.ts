import { REVIEWS_REPO } from "astro:env/client";
import {
  APP_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  INSTALLATION_ID,
  PRIVATE_KEY,
  WEBHOOK_SECRET,
} from "astro:env/server";
import { App } from "octokit";
import {
  RecentDesignReviewsDocument,
  TypedDocumentString,
} from "../gql/graphql";
import prisma from "./prisma";

export const app = new App({
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

async function query<TData, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables,
): Promise<TData> {
  return (await app.getInstallationOctokit(INSTALLATION_ID)).graphql<TData>(
    operation.toString(),
    { ...variables },
  );
}

async function pagedQuery<TData extends object, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables,
): Promise<TData> {
  return (
    await app.getInstallationOctokit(INSTALLATION_ID)
  ).graphql.paginate<TData>(operation.toString(), {
    ...variables,
  });
}

function notNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

let updateRunning = Promise.resolve();

export async function updateDesignReviews() {
  await updateRunning;
  let finished;
  updateRunning = new Promise((resolve) => {
    finished = resolve;
  });
  const latestKnownReview = await prisma.designReview.findFirst({
    orderBy: { updated: "desc" },
    select: { updated: true },
  });
  const [repoOwner, repoName] = REVIEWS_REPO.split("/");
  const result = await pagedQuery(RecentDesignReviewsDocument, {
    since: latestKnownReview?.updated,
    owner: repoOwner,
    repo: repoName,
  });
  if (!result.repository) {
    throw new Error(`${REVIEWS_REPO} repository is missing!`);
  }
  const issues = result.repository.issues.nodes?.filter(notNull);
  if (!issues || issues.length === 0) {
    return;
  }
  await prisma.$transaction(
    issues.map((issue) =>
      prisma.designReview.upsert({
        where: { id: issue.id },
        create: {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body,
          created: issue.createdAt,
          updated: issue.updatedAt,
          closed: issue.closedAt,
          labels: {
            create: issue.labels?.nodes
              ?.filter(notNull)
              .map((label) => ({ label: label.name, labelId: label.id })),
          },
        },
        update: {
          title: issue.title,
          updated: issue.updatedAt,
          closed: issue.closedAt,
          body: issue.body,
          labels: {
            deleteMany: {
              labelId: {
                notIn:
                  issue.labels?.nodes
                    ?.filter(notNull)
                    .map((label) => label.id) ?? [],
              },
            },
            upsert: issue.labels?.nodes?.filter(notNull).map((label) => ({
              where: {
                reviewId_labelId: { reviewId: issue.id, labelId: label.id },
              },
              create: { labelId: label.id, label: label.name },
              update: {},
            })),
          },
        },
        select: null,
      }),
    ),
  );
  finished!();
  return issues.length;
}
updateDesignReviews().catch((e) => console.error(e));
