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
  IssueMetadataDocument,
  ListMinutesInYearDocument,
  ListMinutesYearsDocument,
  RecentIssuesDocument,
  type ListMinutesYearsQuery,
  type RecentIssuesQuery,
} from "../../gql/graphql";
import { pagedQuery, query } from "../github";
import { parseMinutes, type Minutes } from "../minutes-parser";
import { prisma } from "../prisma";
import { tagMemberIdsByAttendanceName } from "../tag-members";
import { notNull } from "../util";

type IssueList = NonNullable<
  NonNullable<RecentIssuesQuery["repository"]>["issues"]["nodes"]
>;
type CommentsType = NonNullable<IssueList[0]>["comments"]["nodes"];

function makeCommentUpserts(
  comments: CommentsType,
  { isPrivateBrainstorming }: { isPrivateBrainstorming: boolean },
): Prisma.IssueCommentUpsertWithWhereUniqueWithoutIssueInput[] | undefined {
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

export async function updateIssues(org: string, repo: string): Promise<void> {
  const [latestKnownReview, latestPrivateComment] = await Promise.all([
    prisma.issue.findFirst({
      orderBy: { updated: "desc" },
      select: { updated: true },
    }),
    prisma.issueComment.findFirst({
      where: { isPrivateBrainstorming: true },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  console.log(
    `Querying ${org}/${repo} after ${latestKnownReview?.updated.toISOString()}`,
  );
  const result = await pagedQuery(RecentIssuesDocument, {
    since: latestKnownReview?.updated,
    owner: org,
    repo,
  });
  if (!result.repository) {
    throw new Error(`${org}/${repo} repository is missing!`);
  }
  const issues = result.repository.issues.nodes?.filter(notNull);
  if (!issues || issues.length === 0) {
    return;
  }
  console.log(`Inserting ${issues.length} reviews.`);

  await prisma.$transaction(
    issues.map((issue) => {
      const update: Omit<
        Prisma.IssueCreateInput,
        "id" | "org" | "repo" | "number" | "created"
      > = {
        title: issue.title,
        updated: issue.updatedAt as string,
        closed: issue.closedAt as string | undefined,
        body: issue.body,
        assignees: {
          connectOrCreate: issue.assignees.nodes
            ?.filter(notNull)
            .map(({ id, login }) => ({
              where: { id },
              create: { id, username: login },
            })),
        },
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
      return prisma.issue.upsert({
        where: { id: issue.id },
        create: {
          id: issue.id,
          org,
          repo,
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
          assignees: {
            set: [],
            connectOrCreate: update.assignees?.connectOrCreate,
          },
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
                issueId_labelId: { issueId: issue.id, labelId: label.id },
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
  let result: RecentIssuesQuery;
  try {
    result = await pagedQuery(RecentIssuesDocument, {
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
      const designReviewCreate: Prisma.DesignReviewCreateWithoutIssueInput = {
        privateBrainstormingIssueId: issue.id,
        privateBrainstormingIssueNumber: issue.number,
        pendingPrivateBrainstormingCommentsFrom: issue.comments.pageInfo
          .hasNextPage
          ? issue.comments.pageInfo.endCursor
          : null,
      };
      return prisma.issue.update({
        where: {
          org_repo_number: { org: TAG_ORG, repo: REVIEWS_REPO, number },
        },
        data: {
          comments: {
            upsert: makeCommentUpserts(issue.comments.nodes, {
              isPrivateBrainstorming: true,
            }),
          },
          designReview: {
            upsert: { create: designReviewCreate, update: designReviewCreate },
          },
        },
      });
    }),
  );
}

async function updateRemainingComments() {
  const withPendingComments = await prisma.issue.findMany({
    where: {
      OR: [
        { pendingCommentsFrom: { not: null } },
        {
          designReview: {
            pendingPrivateBrainstormingCommentsFrom: { not: null },
          },
        },
      ],
    },
    include: { designReview: true },
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
  for (const issue of publicComments) {
    if (issue.node?.__typename !== "Issue") continue;
    await prisma.issue.update({
      where: { id: issue.node.id },
      data: {
        pendingCommentsFrom: null,
        comments: {
          upsert: makeCommentUpserts(issue.node.comments.nodes, {
            isPrivateBrainstorming: false,
          }),
        },
      },
    });
  }

  const brainstormingComments = await Promise.all(
    withPendingComments
      .filter(
        (
          review,
        ): review is typeof review & {
          designReview: { privateBrainstormingIssueId: string };
        } =>
          review.designReview?.privateBrainstormingIssueId != null &&
          review.designReview.pendingPrivateBrainstormingCommentsFrom != null,
      )
      .map((review) =>
        pagedQuery(IssueCommentsDocument, {
          cursor: review.designReview.pendingPrivateBrainstormingCommentsFrom,
          id: review.designReview.privateBrainstormingIssueId,
        }),
      ),
  );
  for (const issue of brainstormingComments) {
    if (issue.node?.__typename !== "Issue") continue;
    await prisma.designReview.update({
      where: { privateBrainstormingIssueId: issue.node.id },
      data: {
        pendingPrivateBrainstormingCommentsFrom: null,
        issue: {
          update: {
            data: {
              comments: {
                upsert: makeCommentUpserts(issue.node.comments.nodes, {
                  isPrivateBrainstorming: true,
                }),
              },
            },
          },
        },
      },
    });
  }
}

export async function updateIssuesById(ids: string[]): Promise<void> {
  while (ids.length > 0) {
    const chunk = ids.splice(0, 100);
    const issueUpdates = await query(IssueMetadataDocument, { ids: chunk });
    await Promise.all(
      issueUpdates.nodes
        .filter(
          (node) =>
            node?.__typename === "Issue" || node?.__typename === "PullRequest",
        )
        .map((issue) =>
          prisma.issue.update({
            where: { id: issue.id },
            data: {
              org: issue.repository.owner.login,
              repo: issue.repository.name,
              number: issue.number,
              title: issue.title,
              body: issue.body,
              assignees: {
                set: [],
                connectOrCreate: issue.assignees.nodes
                  ?.filter(notNull)
                  .map(({ id, login }) => ({
                    where: { id },
                    create: { id, username: login },
                  })),
              },
              labels: {
                set: issue.labels?.nodes
                  ?.filter(notNull)
                  .map(({ id, name }) => ({
                    issueId_labelId: { issueId: issue.id, labelId: id },
                    label: name,
                  })),
              },
              milestone: issue.milestone
                ? {
                    connectOrCreate: {
                      where: { id: issue.milestone.id },
                      create: {
                        id: issue.milestone.id,
                        title: issue.milestone.title,
                        dueOn: z
                          .string()
                          .optional()
                          .parse(issue.milestone.dueOn),
                      },
                    },
                  }
                : { disconnect: true },
              updated: z.string().parse(issue.updatedAt),
              closed: z.string().nullable().parse(issue.closedAt),
            },
          }),
        ),
    );
  }
}

async function getMinutesFromGithubResponse(
  response: ListMinutesYearsQuery,
): Promise<
  { year: number; name: string; minutesId: string; minutesUrl: string }[]
> {
  const repository = response.repository?.object;
  if (!repository || repository.__typename !== "Tree") {
    console.error(
      `${TAG_ORG}/${MEETINGS_REPO} has ${repository?.__typename} at its root. Should be a Tree.`,
    );
    return [];
  }
  const result = [];
  for (const yearId of repository.entries ?? []) {
    const yearAsNumber = parseInt(yearId.name);
    if (isNaN(yearAsNumber) || yearId.object?.__typename !== "Tree") {
      continue;
    }
    console.log(`Listing minutes documents in ${yearId.name}.`);
    const year = await query(ListMinutesInYearDocument, {
      id: yearId.object.id,
    });
    if (year.node?.__typename!== "Tree" || year.node.entries == null) {
      continue;
    }
    for (const meetingGroup of year.node.entries) {
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

function getReviewNameFromUrl(
  url: string,
): `${string}/${string}#${string}` | null {
  const match =
    /\/(?<org>[^/]+)\/(?<repo>[^/]+)\/(?:issues|pull)\/(?<number>\d+)(?:#.*)?$/.exec(
      url,
    );
  if (!match || !match.groups) {
    console.warn(`Ignoring discussion about URL ${url}`);
    return null;
  }
  return `${match.groups.org}/${match.groups.repo}#${match.groups.number}`;
}

function createDiscussionsFromMinutes(
  minutes: Minutes,
  issueIdsByName: Map<`${string}/${string}#${string}`, string>,
): Prisma.DiscussionCreateWithoutMeetingInput[] {
  return Object.entries(minutes.discussion).flatMap(
    ([designReviewUrl, discussions]) => {
      const reviewNumber = getReviewNameFromUrl(designReviewUrl);
      if (reviewNumber == null) {
        return [];
      }
      const issueId = issueIdsByName.get(reviewNumber);
      if (!discussions || !issueId) {
        // Just drop discussions about design reviews that were closed before this server started.
        return [];
      }
      return discussions.map((discussion) => ({
        issue: { connect: { id: issueId } },
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

/**
 * @param knownBlobContents Maps blob IDs to their contents. Any unknown blobs will be fetched from
 * Github.
 */
export async function parseNewMinutes(
  knownBlobContents: Map<string, string> = new Map(),
): Promise<void> {
  const [newMinutes, issueNames] = await Promise.all([
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
    prisma.issue.findMany({
      select: { id: true, org: true, repo: true, number: true },
    }),
  ]);
  const issueIdsByName = new Map<`${string}/${string}#${number}`, string>(
    issueNames.map(({ id, org, repo, number }) => [
      `${org}/${repo}#${number}`,
      id,
    ]),
  );
  console.log(`Loading ${newMinutes.length} minutes documents.`);
  while (newMinutes.length > 0) {
    const chunk = newMinutes.splice(0, 20);
    const unknownChunk = chunk.filter(
      ({ minutesId }) => !knownBlobContents.has(minutesId),
    );
    if (unknownChunk.length > 0) {
      console.log(
        `Fetching ${unknownChunk.length} minutes documents from Github: ${unknownChunk[0].year}/${unknownChunk[0].name}...`,
      );
      const contents = await query(BlobContentsDocument, {
        ids: unknownChunk.map((item) => item.minutesId),
      });
      for (let i = 0; i < unknownChunk.length; i++) {
        const blob = contents.nodes[i];
        if (
          blob?.__typename !== "Blob" ||
          unknownChunk[i].minutesId !== blob.id
        ) {
          console.error(
            `Github returned unexpected results when getting contents for ${JSON.stringify(chunk)}[${i}]: ` +
              `${JSON.stringify(blob)}.`,
          );
          return;
        }
        const { year, name } = unknownChunk[i];
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
        knownBlobContents.set(blob.id, blob.text);
      }
    }
    for (const minutes of chunk) {
      const content = knownBlobContents.get(minutes.minutesId);
      if (!content) continue;
      await updateMinutesInDb(
        minutes.minutesId,
        content,
        minutes.year,
        minutes.name,
        issueIdsByName,
      );
    }
  }
}

async function updateMinutesInDb(
  blobId: string,
  blobText: string,
  year: number,
  name: string,
  issueIdsByName: Map<`${string}/${string}#${number}`, string>,
) {
  const minutes = parseMinutes(blobText);
  await prisma.$transaction([
    // Clear out existing sessions.
    prisma.meetingSession.deleteMany({
      where: { meetingYear: year, meetingName: name },
    }),
    prisma.discussion.deleteMany({
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
          create: createDiscussionsFromMinutes(minutes, issueIdsByName),
        },
      },
    }),
  ]);
}

export async function updateMinutes(): Promise<void> {
  console.log("Listing minutes document years.");
  const [currentMeetingYears, dbMeetings] = await Promise.all([
    query(ListMinutesYearsDocument, {
      owner: TAG_ORG,
      repo: MEETINGS_REPO,
    }),
    prisma.meeting.findMany(),
  ]);
  const existingMeetings = new Map<string, string>();
  for (const { year, name, minutesId } of dbMeetings) {
    existingMeetings.set(`${year}/${name}`, minutesId);
  }

  const newMeetings = await getMinutesFromGithubResponse(currentMeetingYears);
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
  await updateIssues(TAG_ORG, REVIEWS_REPO);
  await updateMinutes();
  finished!();
}

/** Reparses all of the minutes in the database, without refetching anything from Github. */
export async function reparseMinutes(): Promise<number> {
  const [hasMinutes, issueNames] = await Promise.all([
    prisma.meeting.findMany({
      where: { NOT: { contents: null, cachedMinutesId: null } },
      select: { year: true, name: true, cachedMinutesId: true, contents: true },
    }),
    prisma.issue.findMany({
      select: { id: true, org: true, repo: true, number: true },
    }),
  ]);
  const issueIdsByName = new Map<`${string}/${string}#${number}`, string>(
    issueNames.map(({ id, org, repo, number }) => [
      `${org}/${repo}#${number}`,
      id,
    ]),
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
      issueIdsByName,
    );
  }
  return hasMinutes.length;
}
