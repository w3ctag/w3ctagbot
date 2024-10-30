import { REVIEWS_REPO } from "astro:env/client";
import { RecentDesignReviewsDocument } from "../../gql/graphql";
import { pagedQuery } from "../github";
import { prisma } from "../prisma";
import { notNull } from "../util";

export async function updateDesignReviews(): Promise<number> {
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
  return issues.length;
}

let updateRunning = Promise.resolve();
export async function updateAll(): Promise<void> {
  await updateRunning;
  let finished: () => void;
  updateRunning = new Promise((resolve) => {
    finished = resolve;
  });
  await updateDesignReviews();
  finished!();
}
