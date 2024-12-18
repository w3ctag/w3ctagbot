import { GraphqlResponseError } from "@octokit/graphql";
import type { Prisma } from "@prisma/client";
import {
  MEETINGS_REPO,
  PRIVATE_BRAINSTORMING_REPO,
  REVIEWS_REPO,
  TAG_ORG,
} from "astro:env/client";
import { z } from "zod";
import {
  BlobContentsDocument,
  IssueCommentsDocument,
  ListMinutesDocument,
  RecentDesignReviewsDocument,
  type ListMinutesQuery,
  type RecentDesignReviewsQuery,
} from "../../gql/graphql";
import { pagedQuery, query } from "../github";
import { parseMinutes, type Minutes } from "../minutes-parser";
import { prisma } from "../prisma";
import { tagMemberIdsByAttendanceName } from "../tag-members";
import { notNull } from "../util";

type IssueList = NonNullable<
  NonNullable<RecentDesignReviewsQuery["repository"]>["issues"]["nodes"]
>;
type CommentsType = NonNullable<IssueList[0]>["comments"]["nodes"];

function makeCommentUpserts(
  comments: CommentsType,
  { isPrivateBrainstorming }: { isPrivateBrainstorming: boolean },
): Prisma.ReviewCommentUpsertWithWhereUniqueWithoutReviewInput[] | undefined {
  return comments
    ?.filter(notNull)
    .map(({ id, url, author, publishedAt, updatedAt, body, isMinimized }) => {
      const typedPublishedAt = z.string().parse(publishedAt);
      const typedUpdatedAt = z.string().parse(updatedAt);
      const typedUrl = z.string().parse(url);
      const create = {
        id,
        url: typedUrl,
        publishedAt: typedPublishedAt,
        updatedAt: typedUpdatedAt,
        body,
        author: author
          ? {
              connectOrCreate: {
                where: { id: author.id },
                create: { id: author.id, username: author.login },
              },
            }
          : undefined,
        isMinimized,
        isPrivateBrainstorming,
      };
      return {
        where: { id: create.id },
        create,
        update: { updatedAt: typedUpdatedAt, body, isMinimized },
      };
    });
}

export async function updateDesignReviews(): Promise<void> {
  const [latestKnownReview, latestPrivateComment] = await Promise.all([
    prisma.designReview.findFirst({
      orderBy: { updated: "desc" },
      select: { updated: true },
    }),
    prisma.reviewComment.findFirst({
      where: { isPrivateBrainstorming: true },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  console.log(
    `Querying design reviews after ${latestKnownReview?.updated.toISOString()}`,
  );
  const result = await pagedQuery(RecentDesignReviewsDocument, {
    since: latestKnownReview?.updated,
    owner: TAG_ORG,
    repo: REVIEWS_REPO,
  });
  if (!result.repository) {
    throw new Error(`${TAG_ORG}/${REVIEWS_REPO} repository is missing!`);
  }
  const issues = result.repository.issues.nodes?.filter(notNull);
  if (!issues || issues.length === 0) {
    return;
  }
  console.log(`Inserting ${issues.length} reviews.`);

  await prisma.$transaction(
    issues.map((issue) => {
      const update: Omit<
        Prisma.DesignReviewCreateInput,
        "id" | "number" | "created"
      > = {
        title: issue.title,
        updated: issue.updatedAt as string,
        closed: issue.closedAt as string | undefined,
        body: issue.body,
        milestone: issue.milestone
          ? {
              connectOrCreate: {
                where: { id: issue.milestone.id },
                create: {
                  id: issue.milestone.id,
                  dueOn: issue.milestone.dueOn as string | null,
                  title: issue.milestone.title,
                },
              },
            }
          : undefined,
        pendingCommentsFrom: issue.comments.pageInfo.hasNextPage
          ? issue.comments.pageInfo.endCursor
          : null,
      };
      const commentUpsert = makeCommentUpserts(issue.comments.nodes, {
        isPrivateBrainstorming: false,
      });
      return prisma.designReview.upsert({
        where: { id: issue.id },
        create: {
          id: issue.id,
          number: issue.number,
          created: issue.createdAt as string,
          ...update,
          labels: {
            create: issue.labels?.nodes
              ?.filter(notNull)
              .map((label) => ({ label: label.name, labelId: label.id })),
          },
          comments: { create: commentUpsert?.map((comment) => comment.create) },
        },
        update: {
          ...update,
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
          comments: { upsert: commentUpsert },
        },
        select: null,
      });
    }),
  );
  await updatePrivateBrainstorming(latestPrivateComment?.updatedAt);
  await updateRemainingComments();
}

async function updatePrivateBrainstorming(
  since: Date | undefined,
): Promise<void> {
  console.log(
    `Querying private brainstorming threads after ${since?.toISOString()}.`,
  );
  let result: RecentDesignReviewsQuery;
  try {
    result = await pagedQuery(RecentDesignReviewsDocument, {
      since,
      owner: TAG_ORG,
      repo: PRIVATE_BRAINSTORMING_REPO,
    });
  } catch (e: unknown) {
    if (e instanceof GraphqlResponseError) {
      console.error(e.message);
      return;
    }
    throw e;
  }
  if (!result.repository) {
    throw new Error(
      `${TAG_ORG}/${PRIVATE_BRAINSTORMING_REPO} repository is missing!`,
    );
  }
  const issues = result.repository.issues.nodes?.filter(notNull);
  if (!issues || issues.length === 0) {
    return;
  }
  await prisma.$transaction(
    issues.flatMap((issue) => {
      const mirroredFromMatch = issue.body.match(
        /Mirrored from: (?<org>\w+)\/(?<repo>[\w-]+)#(?<number>\d+)/u,
      );
      if (
        !mirroredFromMatch ||
        mirroredFromMatch.groups?.org !== TAG_ORG ||
        mirroredFromMatch.groups.repo !== REVIEWS_REPO
      ) {
        return [];
      }
      const number = parseInt(mirroredFromMatch.groups.number);
      return prisma.designReview.update({
        where: { number },
        data: {
          privateBrainstormingIssueId: issue.id,
          pendingPrivateBrainstormingCommentsFrom: issue.comments.pageInfo
            .hasNextPage
            ? issue.comments.pageInfo.endCursor
            : null,
          comments: {
            upsert: makeCommentUpserts(issue.comments.nodes, {
              isPrivateBrainstorming: true,
            }),
          },
        },
      });
    }),
  );
}

async function updateRemainingComments() {
  const withPendingComments = await prisma.designReview.findMany({
    where: {
      OR: [
        { pendingCommentsFrom: { not: null } },
        { pendingPrivateBrainstormingCommentsFrom: { not: null } },
      ],
    },
  });
  const publicComments = await Promise.all(
    withPendingComments
      .filter((review) => review.pendingCommentsFrom != null)
      .map((review) =>
        pagedQuery(IssueCommentsDocument, {
          cursor: review.pendingCommentsFrom,
          id: review.id,
        }),
      ),
  );
  await Promise.all(
    publicComments
      .map((query) => query.node)
      .filter(
        (issue): issue is typeof issue & { __typename: "Issue" } =>
          issue?.__typename === "Issue",
      )
      .map((issue) =>
        prisma.designReview.update({
          where: { id: issue.id },
          data: {
            pendingCommentsFrom: null,
            comments: {
              upsert: makeCommentUpserts(issue.comments.nodes, {
                isPrivateBrainstorming: false,
              }),
            },
          },
        }),
      ),
  );
  const brainstormingComments = await Promise.all(
    withPendingComments
      .filter(
        (
          review,
        ): review is typeof review & { privateBrainstormingIssueId: string } =>
          review.privateBrainstormingIssueId != null &&
          review.pendingPrivateBrainstormingCommentsFrom != null,
      )
      .map((review) =>
        pagedQuery(IssueCommentsDocument, {
          cursor: review.pendingPrivateBrainstormingCommentsFrom,
          id: review.privateBrainstormingIssueId,
        }),
      ),
  );
  await Promise.all(
    brainstormingComments
      .map((query) => query.node)
      .filter(
        (issue): issue is typeof issue & { __typename: "Issue" } =>
          issue?.__typename === "Issue",
      )
      .map((issue) =>
        prisma.designReview.update({
          where: { privateBrainstormingIssueId: issue.id },
          data: {
            pendingPrivateBrainstormingCommentsFrom: null,
            comments: {
              upsert: makeCommentUpserts(issue.comments.nodes, {
                isPrivateBrainstorming: true,
              }),
            },
          },
        }),
      ),
  );
}

function getMinutesFromGithubResponse(
  response: ListMinutesQuery,
): { year: number; name: string; minutesId: string; minutesUrl: string }[] {
  const repository = response.repository?.object;
  if (!repository || repository.__typename !== "Tree") {
    console.error(
      `${TAG_ORG}/${MEETINGS_REPO} has ${repository?.__typename} at its root. Should be a Tree.`,
    );
    return [];
  }
  const result = [];
  for (const year of repository.entries ?? []) {
    const yearAsNumber = parseInt(year.name);
    if (
      isNaN(yearAsNumber) ||
      year.object?.__typename !== "Tree" ||
      !year.object.entries
    ) {
      continue;
    }
    for (const meetingGroup of year.object.entries) {
      if (
        meetingGroup.object?.__typename !== "Tree" ||
        !meetingGroup.object.entries
      ) {
        continue;
      }
      const meetingType = meetingGroup.name;
      for (const minutes of meetingGroup.object.entries) {
        if (minutes.object?.__typename !== "Blob") {
          continue;
        }
        const minutesUrl =
          `https://github.com/${TAG_ORG}/${MEETINGS_REPO}/` +
          `blob/${response.repository?.defaultBranchRef?.name ?? "HEAD"}/${minutes.path}`;
        if (meetingType === "telcons") {
          const match = /(?<date>\d\d-\d\d)-minutes.md/.exec(minutes.name);
          if (match && match.groups) {
            result.push({
              year: yearAsNumber,
              name: match.groups.date,
              minutesId: minutes.object.id,
              minutesUrl,
            });
          }
        } else if (minutes.name === "minutes.md") {
          result.push({
            year: yearAsNumber,
            name: meetingType,
            minutesId: minutes.object.id,
            minutesUrl,
          });
        }
      }
    }
  }
  return result;
}

function createSessionsFromMinutes(
  year: number,
  meetingName: string,
  minutes: Minutes,
): Prisma.MeetingSessionCreateWithoutMeetingInput[] {
  return Object.entries(minutes.attendance).map(([session, names]) => ({
    type: session,
    attendees: {
      create: Array.from(
        new Set(
          names
            .map((name) => {
              const attendeeId = tagMemberIdsByAttendanceName.get(
                name.toLowerCase(),
              );
              if (attendeeId == null) {
                console.error(
                  `${name} isn't a known TAG member alias in ${year}/${meetingName}/${session}.`,
                );
                return null;
              }
              return attendeeId;
            })
            .filter(notNull),
        ),
        (attendeeId) => ({ attendeeId }),
      ),
    } satisfies Prisma.MeetingAttendeeCreateNestedManyWithoutSessionInput,
  }));
}

function getReviewNumberFromUrl(url: string): number | null {
  const match = /\/(?<number>\d+)(?:#.*)?$/.exec(url);
  if (!match || !match.groups) {
    console.warn(`Ignoring discussion about URL ${url}`);
    return null;
  }
  return parseInt(match.groups.number);
}

function createDiscussionsFromMinutes(
  minutes: Minutes,
  designReviewIdsByNumber: Map<number, string>,
): Prisma.DiscussionCreateWithoutMeetingInput[] {
  return Object.entries(minutes.discussion).flatMap(
    ([designReviewUrl, discussions]) => {
      const reviewNumber = getReviewNumberFromUrl(designReviewUrl);
      if (reviewNumber == null) {
        return [];
      }
      const designReviewId = designReviewIdsByNumber.get(reviewNumber);
      if (!discussions || !designReviewId) {
        // Just drop discussions about design reviews that were closed before this server started.
        return [];
      }
      return discussions.map((discussion) => ({
        designReview: { connect: { id: designReviewId } },
        markdown: discussion.content,
        proposedComments: {
          create: discussion.proposedComments.map((markdown) => ({
            markdown,
          })),
        },
      }));
    },
  );
}

export async function parseNewMinutes(): Promise<void> {
  const [newMinutes, designReviewNumbers] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        OR: [
          { cachedMinutesId: null },
          {
            NOT: {
              cachedMinutesId: { equals: prisma.meeting.fields.minutesId },
            },
          },
        ],
      },
      select: { year: true, name: true, minutesId: true },
      orderBy: [{ year: "asc" }, { name: "asc" }],
    }),
    prisma.designReview.findMany({ select: { id: true, number: true } }),
  ]);
  const designReviewIdsByNumber = new Map(
    designReviewNumbers.map(({ id, number }) => [number, id]),
  );
  console.log(`Fetching and parsing ${newMinutes.length} minutes documents.`);
  while (newMinutes.length > 0) {
    const chunk = newMinutes.splice(0, 20);
    console.log(
      `Fetching ${chunk.length} minutes documents from Github: ${chunk[0].year}/${chunk[0].name}...`,
    );
    const contents = await query(BlobContentsDocument, {
      ids: chunk.map((item) => item.minutesId),
    });
    for (let i = 0; i < chunk.length; i++) {
      const blob = contents.nodes[i];
      if (blob?.__typename !== "Blob" || chunk[i].minutesId !== blob.id) {
        console.error(
          `Github returned unexpected results when getting contents for ${JSON.stringify(chunk)}[${i}]: ` +
            `${JSON.stringify(blob)}.`,
        );
        return;
      }
      const { year, name } = chunk[i];
      if (!blob.text) {
        console.error(
          `Blob ${blob.id} for meeting ${year}/${name} has no text. ` +
            `It may be binary (${blob.isBinary}).`,
        );
        continue;
      }
      if (blob.isTruncated) {
        console.error(
          `Blob ${blob.id} for meeting ${year}/${name} is truncated.`,
        );
        continue;
      }
      await updateMinutesInDb(
        blob.id,
        blob.text,
        year,
        name,
        designReviewIdsByNumber,
      );
    }
  }
}

async function updateMinutesInDb(
  blobId: string,
  blobText: string,
  year: number,
  name: string,
  designReviewIdsByNumber: Map<number, string>,
) {
  const minutes = parseMinutes(blobText);
  await prisma.$transaction([
    // Clear out existing sessions.
    prisma.meetingSession.deleteMany({
      where: { meetingYear: year, meetingName: name },
    }),
    // And create new ones from the new minutes.
    prisma.meeting.update({
      where: { year_name: { year, name } },
      data: {
        cachedMinutesId: blobId,
        contents: blobText,
        sessions: {
          create: createSessionsFromMinutes(year, name, minutes),
        },
        discussions: {
          create: createDiscussionsFromMinutes(
            minutes,
            designReviewIdsByNumber,
          ),
        },
      },
    }),
  ]);
}

export async function updateMinutes(): Promise<void> {
  console.log("Listing minutes documents.");
  const [currentMeetings, dbMeetings] = await Promise.all([
    query(ListMinutesDocument, {
      owner: TAG_ORG,
      repo: MEETINGS_REPO,
    }),
    prisma.meeting.findMany(),
  ]);
  const existingMeetings = new Map<string, string>();
  for (const { year, name, minutesId } of dbMeetings) {
    existingMeetings.set(`${year}/${name}`, minutesId);
  }

  const newMeetings = getMinutesFromGithubResponse(currentMeetings);
  const createMeetings: Prisma.MeetingCreateInput[] = [];
  const updateMeetings: {
    where: Prisma.MeetingWhereUniqueInput;
    data: Prisma.MeetingUpdateInput;
  }[] = [];
  for (const { year, name, minutesId, minutesUrl } of newMeetings) {
    const existingMinutesId = existingMeetings.get(`${year}/${name}`);
    existingMeetings.delete(`${year}/${name}`);
    if (existingMinutesId) {
      if (existingMinutesId !== minutesId) {
        updateMeetings.push({
          where: { year_name: { year, name } },
          data: { minutesId },
        });
      }
    } else {
      createMeetings.push({ year, name, minutesId, minutesUrl });
    }
  }
  // Anything that's still in the existingMeetings map is a meeting that no longer exists in the
  // repository.
  const deleteMeetings: Prisma.MeetingWhereInput[] = Array.from(
    existingMeetings.keys(),
    (meeting) => {
      const match = /^(?<year>\d+)\/(?<name>.+)$/.exec(meeting);
      if (match && match.groups) {
        return { year: parseInt(match.groups.year), name: match.groups.name };
      }
      return null;
    },
  ).filter(notNull);

  console.log(
    `Creating ${createMeetings.length} meetings; updating ${updateMeetings.length};` +
      ` deleting ${deleteMeetings.length}.`,
  );

  await Promise.all([
    prisma.meeting.createMany({ data: createMeetings }),
    Promise.all(updateMeetings.map((up) => prisma.meeting.update(up))),
    prisma.meeting.deleteMany({ where: { OR: deleteMeetings } }),
  ]);

  // Start parsing without blocking on it.
  void parseNewMinutes();
}

let updateRunning = Promise.resolve();
export async function updateAll(): Promise<void> {
  await updateRunning;
  let finished: () => void;
  updateRunning = new Promise((resolve) => {
    finished = resolve;
  });
  await updateDesignReviews();
  await updateMinutes();
  finished!();
}

/** Reparses all of the minutes in the database, without refetching anything from Github. */
export async function reparseMinutes(): Promise<number> {
  const [hasMinutes, designReviewNumbers] = await Promise.all([
    prisma.meeting.findMany({
      where: { NOT: { contents: null, cachedMinutesId: null } },
      select: { year: true, name: true, cachedMinutesId: true, contents: true },
    }),
    prisma.designReview.findMany({ select: { id: true, number: true } }),
  ]);
  const designReviewIdsByNumber = new Map(
    designReviewNumbers.map(({ id, number }) => [number, id]),
  );
  for (const meeting of hasMinutes) {
    if (meeting.cachedMinutesId == null || meeting.contents == null) {
      continue;
    }
    await updateMinutesInDb(
      meeting.cachedMinutesId,
      meeting.contents,
      meeting.year,
      meeting.name,
      designReviewIdsByNumber,
    );
  }
  return hasMinutes.length;
}
