import { REVIEWS_REPO } from "astro:env/client";
import {
  APP_ID,
  CLIENT_ID,
  CLIENT_SECRET,
  PRIVATE_KEY,
  WEBHOOK_SECRET,
} from "astro:env/server";
import { App } from "octokit";
import {
  RecentDesignReviewsDocument,
  TypedDocumentString,
} from "../gql/graphql";
import { prisma } from "./prisma";

export const app: App = new App({
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

// This won't work if an instance of the app is ever installed in more than 1 org. If that happens,
// we'll need to pass the relevant org into this function.
let installationId: number | undefined = undefined;
async function installationOctokit() {
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

export async function query<TData, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables,
): Promise<TData> {
  return (await installationOctokit()).graphql<TData>(operation.toString(), {
    ...variables,
  });
}

export async function pagedQuery<TData extends object, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables,
): Promise<TData> {
  return (await installationOctokit()).graphql.paginate<TData>(
    operation.toString(),
    { ...variables },
  );
}

function notNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

let updateRunning = Promise.resolve();

export async function updateDesignReviews(): Promise<number> {
  await updateRunning;
  let finished: () => void;
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
    return 0;
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
          created: issue.createdAt as string,
          updated: issue.updatedAt as string,
          closed: issue.closedAt as string | undefined,
          labels: {
            create: issue.labels?.nodes
              ?.filter(notNull)
              .map((label) => ({ label: label.name, labelId: label.id })),
          },
        },
        update: {
          title: issue.title,
          updated: issue.updatedAt as string,
          closed: issue.closedAt as string | undefined,
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
updateDesignReviews().catch((e: unknown) => {
  console.error(e);
});
