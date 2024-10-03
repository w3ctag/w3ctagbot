import { REVIEWS_REPO } from "astro:env/client";
import {
  RecentDesignReviewsDocument,
  TypedDocumentString,
} from "../gql/graphql";
import { prisma } from "./prisma";

import { installationOctokit } from "./github/auth.js";
//export { app } from './github/auth.js';

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
