import { Prisma } from "@generated/prisma/client";
import { type DesignReviewCreateWithoutIssueInput } from "@generated/prisma/models";
import {
  PRIVATE_BRAINSTORMING_REPO,
  REVIEWS_REPO,
  TAG_ORG,
} from "astro:env/client";
import { IssueBodyDocument } from "src/gql/graphql";
import { query } from "./github";
import { prisma } from "./prisma";
import { parseIntOrUndefined } from "./util";

export const mirroredFromRE = new RegExp(
  `Mirrored from: ${TAG_ORG}/${REVIEWS_REPO}#(?<number>\\d+)`,
);

export function getMirrorSource(
  brainstormingIssueBody: string,
): { org: string; repo: string; number: number } | undefined {
  const match = mirroredFromRE.exec(brainstormingIssueBody);
  const number = parseIntOrUndefined(match?.groups?.number);
  if (number === undefined) {
    return undefined;
  }
  return { org: TAG_ORG, repo: REVIEWS_REPO, number };
}

export async function findMainIssueNumberFromMirrorNumber(
  number: number,
): Promise<number | undefined> {
  const cachedMainIssueNumber = (
    await prisma.designReview.findUnique({
      where: { privateBrainstormingIssueNumber: number },
      select: { issue: { select: { number: true } } },
    })
  )?.issue.number;
  if (cachedMainIssueNumber) {
    return cachedMainIssueNumber;
  }

  // Search Github's API for the brainstorming issue, and if successful,
  // cache the result in our database.
  const mirrorIssue = (
    await query(IssueBodyDocument, {
      org: TAG_ORG,
      repo: PRIVATE_BRAINSTORMING_REPO,
      number,
    })
  ).repository?.issue;
  if (mirrorIssue == null) return undefined;
  const mirrorSource = getMirrorSource(mirrorIssue.body);
  if (mirrorSource === undefined) return undefined;
  // Optimistically try to cache the mirror issue details into the main issue.
  const designReview: DesignReviewCreateWithoutIssueInput = {
    privateBrainstormingIssueId: mirrorIssue.id,
    privateBrainstormingIssueNumber: number,
  };
  try {
    console.log(
      `Setting the private mirror of ` +
        `${mirrorSource.org}/${mirrorSource.repo}#${mirrorSource.number} to #${number}.`,
    );
    await prisma.issue.update({
      where: { org_repo_number: mirrorSource },
      data: {
        designReview: {
          upsert: { create: designReview, update: designReview },
        },
      },
    });
  } catch (e: unknown) {
    // Ignore Not Found errors.
    if (
      !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
    ) {
      throw e;
    }
  }
  return mirrorSource.number;
}
