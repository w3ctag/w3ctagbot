import { tagMemberIdsByAttendanceName } from "@lib/tag-members";
import nock from "nock";
import {
  FileContentDocument,
  RemoveLabelsDocument,
  UpdateIssueBodyDocument,
  type FileContentQuery,
  type FileContentQueryVariables,
  type RemoveLabelsMutation,
  type RemoveLabelsMutationVariables,
  type UpdateIssueBodyMutation,
  type UpdateIssueBodyMutationVariables,
} from "src/gql/graphql";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { webhooks } from "../src/lib/github/auth";
import { prisma } from "../src/lib/prisma";
import { handleWebHook, webhookProcessingComplete } from "../src/pages/webhook";
import brainstormingDiscussionPayload from "./payloads/brainstorming-discussion.json" with { type: "json" };
import brainstormingMirrorCreatedPayload from "./payloads/brainstorming-mirror-created.json" with { type: "json" };
import designReviewCommentEditedPayload from "./payloads/design-review-comment-edited.json" with { type: "json" };
import designReviewCreatedPayload from "./payloads/design-review-created.json" with { type: "json" };
import issueResponsePayload from "./payloads/issue-response.json" with { type: "json" };
import pushPayload from "./payloads/push.json" with { type: "json" };

beforeEach(async () => {
  await prisma.issue.deleteMany();
  await prisma.meeting.deleteMany();
  nock.disableNetConnect();
  nock("https://api.github.com")
    .get("/app/installations")
    .optionally()
    .reply(200, [{ id: 12345 }])
    .persist();
  nock("https://api.github.com")
    .post("/app/installations/12345/access_tokens")
    .optionally()
    .reply(201, { token: "FakeAccessToken" })
    .persist();
});
afterEach(async () => {
  await prisma.issue.deleteMany();
  await prisma.meeting.deleteMany();
  nock.cleanAll();
  nock.enableNetConnect();
});

describe("issues", () => {
  describe("opened", () => {
    test("creates a design review in the database", {timeout: 20000}, async () => {
      const payload = JSON.stringify(designReviewCreatedPayload);
      const issueId = designReviewCreatedPayload.issue.node_id;
      const scope = nock("https://api.github.com")
        .post("/graphql", {
          query: UpdateIssueBodyDocument.toString(),
          variables: {
            id: issueId,
            body: designReviewCreatedPayload.issue.body + `
<!-- Content below this is maintained by @w3c-tag-bot -->
---

Track conversations at http://localhost:4321/gh/w3ctag/design-reviews/1110
`,
          } satisfies UpdateIssueBodyMutationVariables,
        })
        .reply(200, {
          data: {
            updateIssue: {
              issue: {
                id: issueId,
              },
            },
          } satisfies UpdateIssueBodyMutation,
        });
      const response = await handleWebHook(
        new Request("https://example.com/webhook", {
          method: "POST",
          headers: {
            "x-github-delivery": "unique id",
            "x-github-event": "issues",
            "X-Hub-Signature-256": await webhooks.sign(payload),
          },
          body: payload,
        }),
      );
      expect(await response.text()).toEqual("");
      expect(response).toHaveProperty("status", 200);
      const result = await prisma.issue.findUniqueOrThrow({
        where: { id: issueId },
        include: {
          labels: { select: { label: true } },
          designReview: { omit: { id: true } },
        },
      });
      expect(result).toEqual({
        id: issueId,
        org: "w3ctag",
        repo: "design-reviews",
        number: 1110,
        title: "windowAudio for getDisplayMedia",
        body: designReviewCreatedPayload.issue.body,
        created: new Date("2025-06-10T20:16:08Z"),
        updated: new Date("2025-06-10T20:16:08Z"),
        closed: null,
        labels: [{ label: "Progress: untriaged" }],
        milestoneId: null,
        pendingCommentsFrom: null,
        designReview: {
          privateBrainstormingIssueId: null,
          privateBrainstormingIssueNumber: null,
          pendingPrivateBrainstormingCommentsFrom: null,
        },
      } satisfies typeof result);
      scope.done();
    });
    describe("after design review exists", () => {
      const issueId = designReviewCreatedPayload.issue.node_id;
      beforeEach(async () => {
        await prisma.issue.create({
          data: {
            id: issueId,
            org: "w3ctag",
            repo: "design-reviews",
            number: 1110,
            title: "windowAudio for getDisplayMedia",
            body: designReviewCreatedPayload.issue.body,
            created: new Date("2025-06-10T20:16:08Z"),
            updated: new Date("2025-06-10T20:16:08Z"),
            designReview: { create: {} },
          },
        });
      });
      test("updates with its private mirror", async () => {
        const payload = JSON.stringify(brainstormingMirrorCreatedPayload);
        const response = await handleWebHook(
          new Request("https://example.com/webhook", {
            method: "POST",
            headers: {
              "x-github-delivery": "unique id",
              "x-github-event": "issues",
              "X-Hub-Signature-256": await webhooks.sign(payload),
            },
            body: payload,
          }),
        );
        expect(await response.text()).toEqual("");
        expect(response).toHaveProperty("status", 200);
        const result = await prisma.issue.findUniqueOrThrow({
          where: { id: issueId },
          select: { id: true, designReview: true },
        });
        expect(result).toEqual({
          id: issueId,
          designReview: {
            id: issueId,
            privateBrainstormingIssueId:
              brainstormingMirrorCreatedPayload.issue.node_id,
            privateBrainstormingIssueNumber: 166,
            pendingPrivateBrainstormingCommentsFrom: null,
          },
        } satisfies typeof result);
      });
      test("ignores malformed mirror issues", async () => {
        const brokenPayload = structuredClone(
          brainstormingMirrorCreatedPayload,
        );
        brokenPayload.issue.body = "This body doesn't declare what it mirrors.";
        const payload = JSON.stringify(brokenPayload);
        const response = await handleWebHook(
          new Request("https://example.com/webhook", {
            method: "POST",
            headers: {
              "x-github-delivery": "unique id",
              "x-github-event": "issues",
              "X-Hub-Signature-256": await webhooks.sign(payload),
            },
            body: payload,
          }),
        );
        expect(await response.text()).toEqual("");
        expect(response).toHaveProperty("status", 200);
        const result = await prisma.issue.findUniqueOrThrow({
          where: { id: issueId },
          select: { id: true, designReview: { omit: { id: true } } },
        });
        expect(result).toEqual({
          id: issueId,
          designReview: {
            privateBrainstormingIssueId: null,
            privateBrainstormingIssueNumber: null,
            pendingPrivateBrainstormingCommentsFrom: null,
          },
        } satisfies typeof result);
      });
    });
  });
});

describe("issue_comment", () => {
  describe("created", () => {
    describe("updates db cache", () => {
      const issueId = "I_kwDOAKfwGc63GXWR";
      beforeEach(async () => {
        await prisma.issue.create({
          data: {
            id: issueId,
            org: "w3ctag",
            repo: "design-reviews",
            number: 1064,
            title: "Canvas Text Metrics for Editing, Art and Design",
            body: "Please review my feature",
            created: "2025-05-18T16:17:07Z",
            updated: "2025-05-29T23:06:05Z",
            designReview: {
              create: {
                privateBrainstormingIssueId:
                  brainstormingDiscussionPayload.issue.node_id,
              },
            },
          },
        });
      });
      test("brainstorming discussion", async () => {
        const payload = JSON.stringify(brainstormingDiscussionPayload);
        const response = await handleWebHook(
          new Request("https://example.com/webhook", {
            method: "POST",
            headers: {
              "x-github-delivery": "unique id",
              "x-github-event": "issue_comment",
              "X-Hub-Signature-256": await webhooks.sign(payload),
            },
            body: payload,
          }),
        );
        expect(await response.text()).toEqual("");
        expect(response).toHaveProperty("status", 200);
        const result = await prisma.issue.findUniqueOrThrow({
          where: { id: issueId },
          select: { id: true, comments: { omit: { issueId: true } } },
        });
        expect(result).toEqual({
          id: issueId,
          comments: [
            {
              id: brainstormingDiscussionPayload.comment.node_id,
              authorId: brainstormingDiscussionPayload.comment.user.node_id,
              body: brainstormingDiscussionPayload.comment.body,
              publishedAt: new Date(
                brainstormingDiscussionPayload.comment.created_at,
              ),
              updatedAt: new Date(
                brainstormingDiscussionPayload.comment.updated_at,
              ),
              url: "https://github.com/w3ctag/design-reviews-private-brainstorming/issues/154#issuecomment-2920775984",
              isMinimized: false,
              isPrivateBrainstorming: true,
            },
          ],
        } satisfies typeof result);
      });
    });
    describe("'pending' progress", () => {
      const issueId = "I_kwDOAKfwGc6slrgI";
      beforeEach(async () => {
        await prisma.issue.create({
          data: {
            id: issueId,
            org: "w3ctag",
            repo: "design-reviews",
            number: 1064,
            title: "Expose contentEncoding in resourceTiming",
            body: "Please review my feature",
            created: "2025-03-04T22:13:33Z",
            updated: "2025-05-28T19:49:16Z",
            labels: {
              create: [
                {
                  labelId: "MDU6TGFiZWwzNTA1NTg4Nzk=",
                  label: "Progress: pending external feedback",
                },
                {
                  labelId: "MDU6TGFiZWwxMTExMTYxMDg0",
                  label: "Venue: WHATWG",
                },
                {
                  labelId: "MDU6TGFiZWwxMzcyNDgyNjU5",
                  label: "Venue: Web Performance WG",
                },
                {
                  labelId: "MDU6TGFiZWwxMzcyNzA4NjE1",
                  label: "Topic: performance",
                },
                {
                  labelId: "MDU6TGFiZWwxOTkzNDMxMTc4",
                  label: "security-tracker",
                },
                {
                  labelId: "LA_kwDOAKfwGc8AAAABnB4hng",
                  label: "Focus: Security (pending)",
                },
              ],
            },
          },
        });
      });
      test("removes 'pending' progress", { timeout: 20000 }, async () => {
        const payload = JSON.stringify(issueResponsePayload);
        const scope = nock("https://api.github.com")
          .post("/graphql", {
            query: RemoveLabelsDocument.toString(),
            variables: {
              labelableId: issueId,
              labelIds: ["MDU6TGFiZWwzNTA1NTg4Nzk="],
            } satisfies RemoveLabelsMutationVariables,
          })
          .reply(200, {
            data: {
              removeLabelsFromLabelable: {
                labelable: {
                  __typename: "Issue",
                  labels: {
                    nodes: [
                      {
                        id: "MDU6TGFiZWwxMzcyNDgyNjU5",
                        name: "Venue: Web Performance WG",
                      },
                    ],
                  },
                },
              },
            } satisfies RemoveLabelsMutation,
          });
        const response = await handleWebHook(
          new Request("https://example.com/webhook", {
            method: "POST",
            headers: {
              "x-github-delivery": "unique id",
              "x-github-event": "issue_comment",
              "X-Hub-Signature-256": await webhooks.sign(payload),
            },
            body: payload,
          }),
        );
        expect(await response.text()).toEqual("");
        expect(response).toHaveProperty("status", 200);
        await webhookProcessingComplete();
        expect(
          await prisma.issue.findUnique({
            where: { id: issueId },
            select: { labels: true },
          }),
        ).toEqual({
          labels: [
            {
              issueId,
              labelId: "MDU6TGFiZWwxMzcyNDgyNjU5",
              label: "Venue: Web Performance WG",
            },
          ],
        });
        scope.done();
      });
      test(
        "doesn't respond to TAG discussion",
        { timeout: 20000 },
        async () => {
          const payloadCopy = structuredClone(issueResponsePayload);
          payloadCopy.comment.user.node_id =
            tagMemberIdsByAttendanceName.get("jeffrey")!;
          const payload = JSON.stringify(payloadCopy);
          // No resulting request to Github.
          const response = await handleWebHook(
            new Request("https://example.com/webhook", {
              method: "POST",
              headers: {
                "x-github-delivery": "unique id",
                "x-github-event": "issue_comment",
                "X-Hub-Signature-256": await webhooks.sign(payload),
              },
              body: payload,
            }),
          );
          expect(await response.text()).toEqual("");
          expect(response).toHaveProperty("status", 200);
          await webhookProcessingComplete();
          expect(
            (
              await prisma.issue.findUnique({
                where: { id: issueId },
                select: { labels: true },
              })
            )?.labels,
          ).toHaveLength(6);
        },
      );
    });
  });

  describe("edited", () => {
    test("updates comment body", async () => {
      await prisma.issue.create({
        data: {
          id: designReviewCommentEditedPayload.issue.node_id,
          body: "Issue body",
          org: "w3ctag",
          repo: "design-reviews",
          number: designReviewCommentEditedPayload.issue.number,
          created: designReviewCommentEditedPayload.issue.created_at,
          updated: designReviewCommentEditedPayload.issue.updated_at,
          title: designReviewCommentEditedPayload.issue.title,
          designReview: { create: {} },
          comments: {
            create: {
              id: designReviewCommentEditedPayload.comment.node_id,
              body: "Old body",
              publishedAt: designReviewCommentEditedPayload.comment.created_at,
              updatedAt: designReviewCommentEditedPayload.comment.created_at,
              url: "https://github.com/w3ctag/design-reviews/issues/1052#issuecomment-2975084078",
              isMinimized: false,
              isPrivateBrainstorming: false,
            },
          },
        },
      });
      const payload = JSON.stringify(designReviewCommentEditedPayload);
      // No resulting request to Github.
      const response = await handleWebHook(
        new Request("https://example.com/webhook", {
          method: "POST",
          headers: {
            "x-github-delivery": "unique id",
            "x-github-event": "issue_comment",
            "X-Hub-Signature-256": await webhooks.sign(payload),
          },
          body: payload,
        }),
      );
      expect(await response.text()).toEqual("");
      expect(response).toHaveProperty("status", 200);
      await webhookProcessingComplete();
      const result = await prisma.issueComment.findUnique({
        where: { id: designReviewCommentEditedPayload.comment.node_id },
        select: { body: true, updatedAt: true },
      });
      expect(result).toEqual({
        body: designReviewCommentEditedPayload.comment.body,
        updatedAt: new Date(
          designReviewCommentEditedPayload.comment.updated_at,
        ),
      } satisfies typeof result);
    });
  });

  describe("deleted", () => {
    test("deletes the cached comment", async () => {
      await prisma.issue.create({
        data: {
          id: designReviewCommentEditedPayload.issue.node_id,
          body: "Issue body",
          org: "w3ctag",
          repo: "design-reviews",
          number: designReviewCommentEditedPayload.issue.number,
          created: designReviewCommentEditedPayload.issue.created_at,
          updated: designReviewCommentEditedPayload.issue.updated_at,
          title: designReviewCommentEditedPayload.issue.title,
          designReview: { create: {} },
          comments: {
            create: {
              id: designReviewCommentEditedPayload.comment.node_id,
              body: "Old body",
              publishedAt: designReviewCommentEditedPayload.comment.created_at,
              updatedAt: designReviewCommentEditedPayload.comment.updated_at,
              url: "https://github.com/w3ctag/design-reviews/issues/1052#issuecomment-2975084078",
              isMinimized: false,
              isPrivateBrainstorming: false,
            },
          },
        },
      });
      const payload = JSON.stringify({
        action: "deleted",
        comment: { node_id: designReviewCommentEditedPayload.comment.node_id },
      });
      // No resulting request to Github.
      const response = await handleWebHook(
        new Request("https://example.com/webhook", {
          method: "POST",
          headers: {
            "x-github-delivery": "unique id",
            "x-github-event": "issue_comment",
            "X-Hub-Signature-256": await webhooks.sign(payload),
          },
          body: payload,
        }),
      );
      expect(await response.text()).toEqual("");
      expect(response).toHaveProperty("status", 200);
      await webhookProcessingComplete();
      expect(
        await prisma.issueComment.findUnique({
          where: { id: designReviewCommentEditedPayload.comment.node_id },
          select: { body: true },
        }),
      ).toEqual(null);
    });
  });
});

describe("push", () => {
  // Long timeout to handle octokit doing exponential backoff on network errors.
  test("refetches minutes", { timeout: 20000 }, async () => {
    // Pre-populate the issue mentioned in the fake discussion.
    await prisma.issue.create({
      data: {
        id: "I_kwDOAKfwGc6IdpC7",
        org: "w3ctag",
        repo: "design-reviews",
        number: 954,
        title: "Element Capture",
        body: "I'm requesting a TAG review of Element Capture.",
        created: "2024-05-10T10:37:41Z",
        updated: "2024-11-19T11:48:39Z",
      },
    });

    const payload = JSON.stringify(pushPayload);
    const minutesMd = `## Breakout A

Present: Tristan, Peter

### [Element Capture](https://github.com/w3ctag/design-reviews/issues/954) - @LeaVerou, @matatk

Still waiting for a reply from proponents.
`;
    const scope = nock("https://api.github.com")
      .post("/graphql", {
        query: FileContentDocument.toString(),
        variables: {
          owner: "w3ctag",
          repo: "meetings",
          expression: "HEAD:2024/telcons/12-09-minutes.md",
        } satisfies FileContentQueryVariables,
      })
      .reply(200, {
        data: {
          repository: {
            defaultBranchRef: { name: "main" },
            object: {
              __typename: "Blob",
              id: "fakeID",
              isTruncated: false,
              isBinary: false,
              text: minutesMd,
            },
          },
        } satisfies FileContentQuery,
      });
    const response = await handleWebHook(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "x-github-delivery": "unique id",
          "x-github-event": "push",
          "X-Hub-Signature-256": await webhooks.sign(payload),
        },
        body: payload,
      }),
    );
    expect(await response.text()).toEqual("");
    expect(response).toHaveProperty("status", 200);
    await webhookProcessingComplete();
    expect(
      await prisma.meeting.findUnique({
        where: { year_name: { year: 2024, name: "12-09" } },
        include: {
          sessions: {
            select: {
              type: true,
              attendees: { select: { attendeeId: true } },
            },
          },
          discussions: { select: { markdown: true, proposedComments: true } },
        },
      }),
    ).toEqual({
      year: 2024,
      name: "12-09",
      minutesId: "fakeID",
      minutesUrl:
        "https://github.com/w3ctag/meetings/blob/main/2024/telcons/12-09-minutes.md",
      cachedMinutesId: "fakeID",
      contents: minutesMd,
      sessions: [
        {
          type: "Breakout A",
          attendees: ["peter", "tristan"].map((name) => ({
            attendeeId: tagMemberIdsByAttendanceName.get(name),
          })),
        },
      ],
      discussions: [
        {
          markdown: `Still waiting for a reply from proponents.`,
          proposedComments: [],
        },
      ],
    });
    scope.done();
  });
});
