import process from "node:process";
import { Octokit } from "octokit";
import {
  RecentDesignReviewsDocument,
  TypedDocumentString,
} from "../gql/graphql";
import prisma from "./prisma";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

function query<TData, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables
): Promise<TData> {
  return octokit.graphql<TData>(operation.toString(), { ...variables });
}

function pagedQuery<TData extends object, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables
): Promise<TData> {
  return octokit.graphql.paginate<TData>(operation.toString(), {
    ...variables,
  });
}

function notNull<T>(value: T | null | undefined): value is T {
  return !!value;
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
  const result = await pagedQuery(RecentDesignReviewsDocument, {
    since: latestKnownReview?.updated,
  });
  if (!result.repository) {
    throw new Error("w3ctag/design-reviews repository is missing!");
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
          created: issue.createdAt,
          updated: issue.updatedAt,
          closed: issue.closedAt,
        },
        update: {
          title: issue.title,
          updated: issue.updatedAt,
          closed: issue.closedAt,
        },
        select: null,
      })
    )
  );
  finished!();
  return issues.length;
}
updateDesignReviews().catch((e) => console.error(e));
