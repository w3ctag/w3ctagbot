import { query } from "@lib/github";
import { parseNewMinutes } from "@lib/github/update";
import { githubIdIsTagMemberOnDate } from "@lib/tag-members";
import { notNull } from "@lib/util";
import type { Prisma } from "@prisma/client";
import type { APIRoute } from "astro";
import { MEETINGS_REPO, REVIEWS_REPO, TAG_ORG } from "astro:env/client";
import {
  FileContentDocument,
  RemoveLabelsDocument,
  type FileContentQuery,
} from "src/gql/graphql";
import { webhooks } from "../lib/github/auth";
import { prisma } from "../lib/prisma";

webhooks.on("issues.opened", async ({ payload }) => {
  await prisma.issue.create({
    data: {
      id: payload.issue.node_id,
      org: payload.repository.owner.login,
      repo: payload.repository.name,
      number: payload.issue.number,
      title: payload.issue.title,
      body: payload.issue.body ?? "",
      created: payload.issue.created_at,
      updated: payload.issue.updated_at,
      closed: payload.issue.closed_at,
      labels: {
        create: payload.issue.labels?.map((label) => ({
          labelId: label.node_id,
          label: label.name,
        })),
      },
    },
  });
});

webhooks.on(["issues.closed", "issues.reopened"], async ({ payload }) => {
  await prisma.issue.update({
    where: {
      id: payload.issue.node_id,
    },
    data: {
      updated: payload.issue.updated_at,
      closed: payload.issue.closed_at,
    },
  });
});

webhooks.on("issues.edited", async ({ payload }) => {
  await prisma.issue.update({
    where: {
      id: payload.issue.node_id,
    },
    data: {
      updated: payload.issue.updated_at,
      title: payload.issue.title,
      body: payload.issue.body ?? "",
    },
  });
});

webhooks.on("issues.labeled", async ({ payload }) => {
  if (!payload.label) return;
  await prisma.label.upsert({
    where: {
      issueId_labelId: {
        issueId: payload.issue.node_id,
        labelId: payload.label.node_id,
      },
    },
    create: {
      issueId: payload.issue.node_id,
      label: payload.label.name,
      labelId: payload.label.node_id,
    },
    update: {},
  });
});

webhooks.on("issues.unlabeled", async ({ payload }) => {
  if (!payload.label) return;
  await prisma.label.delete({
    where: {
      issueId_labelId: {
        issueId: payload.issue.node_id,
        labelId: payload.label.node_id,
      },
    },
  });
});

webhooks.on("issues.milestoned", async ({ payload }) => {
  await prisma.issue.update({
    where: { id: payload.issue.node_id },
    data: {
      milestone: {
        connectOrCreate: {
          where: { id: payload.milestone.node_id },
          create: {
            id: payload.milestone.node_id,
            dueOn: payload.milestone.due_on,
            title: payload.milestone.title,
          },
        },
      },
    },
  });
});

webhooks.on("issues.demilestoned", async ({ payload }) => {
  await prisma.issue.update({
    where: { id: payload.issue.node_id },
    data: { milestoneId: null },
  });
});

webhooks.on("issue_comment.created", async ({ payload }) => {
  if (payload.repository.owner.login !== TAG_ORG) {
    return;
  }

  if (payload.repository.name === REVIEWS_REPO) {
    const authorId = payload.comment.user?.node_id;
    if (!authorId || !githubIdIsTagMemberOnDate(authorId, new Date())) {
      // This looks like a response, so remove any 'Progress' labels that are waiting on a response
      // so we re-discuss the new comment.
      const pendingLabels: string[] = [];
      for (const label of payload.issue.labels) {
        // See https://github.com/w3ctag/design-reviews/labels.
        if (
          label.name === "Progress: pending external feedback" ||
          label.name === "Progress: pending editor update"
        ) {
          pendingLabels.push(label.node_id);
        }
      }
      if (pendingLabels.length > 0) {
        const issueId = payload.issue.node_id;
        console.log(
          `Removing labels from issue ${payload.repository.full_name}#${payload.issue.number}: ${JSON.stringify(pendingLabels)}`,
        );
        const result = await query(RemoveLabelsDocument, {
          labelableId: issueId,
          labelIds: pendingLabels,
        });
        const newLabels =
          result.removeLabelsFromLabelable?.labelable?.labels?.nodes?.filter(
            notNull,
          );
        if (newLabels) {
          await prisma.$transaction([
            prisma.label.deleteMany({ where: { issueId } }),
            prisma.label.createMany({
              data: newLabels.map(
                (label) =>
                  ({
                    issueId,
                    labelId: label.id,
                    label: label.name,
                  }) satisfies Prisma.LabelCreateManyInput,
              ),
            }),
          ]);
        }
      }
    }
  }
});

function addAll<T>(set: Set<T>, array: T[] | null | undefined) {
  if (array) {
    for (const item of array) {
      set.add(item);
    }
  }
}

webhooks.on("push", async ({ payload }) => {
  const repository = payload.repository.full_name;
  if (repository === `${TAG_ORG}/${MEETINGS_REPO}`) {
    const touched = new Set<string>();
    for (const commit of payload.commits) {
      addAll(touched, commit.added);
      addAll(touched, commit.modified);
      addAll(touched, commit.removed);
    }

    const newContents = new Map<string, FileContentQuery>();
    for (const path of touched) {
      newContents.set(
        path,
        await query(FileContentDocument, {
          owner: payload.repository.owner!.login,
          repo: payload.repository.name,
          expression: `HEAD:${path}`,
        }),
      );
    }

    const knownBlobContents = new Map<string, string>();

    for (const [path, content] of newContents.entries()) {
      const object = content.repository?.object;
      const parts =
        /(?<yearStr>\d+)\/(?<meetingType>[^/]+)\/(?<filename>[^.]+)\.md$/.exec(
          path,
        );
      if (!parts?.groups) continue;
      const { yearStr, meetingType, filename } = parts.groups;
      const year = parseInt(yearStr);
      const filename_date = /^(?<month>\d+)-(?<day>\d+)-minutes$/.exec(
        filename,
      );
      let name = meetingType;
      if (name === "telcons") {
        if (!filename_date?.groups) continue;
        const { month, day } = filename_date.groups;
        name = `${month}-${day}`;
      }
      if (object?.__typename !== "Blob" || !object.text) {
        // Remove any record of this file in the database.
        await prisma.meeting.delete({
          where: {
            year_name: { year, name },
          },
        });
      } else {
        // Schedule the content to be updated.
        const minutesUrl =
          `https://github.com/${TAG_ORG}/${MEETINGS_REPO}/` +
          `blob/${content.repository?.defaultBranchRef?.name ?? "HEAD"}/${path}`;

        await prisma.meeting.upsert({
          where: { year_name: { year, name } },
          create: { year, name, minutesUrl, minutesId: object.id },
          update: { minutesId: object.id },
        });
        knownBlobContents.set(object.id, object.text);
      }
    }

    runAsyncWebhookWork(async () => {
      await parseNewMinutes(knownBlobContents);
    });
  }
});

let webhooksCompletePromise: Promise<void> = Promise.resolve();

function runAsyncWebhookWork(work: () => Promise<void>): void {
  const nextPromise = work().then(
    () => {},
    (e: unknown) => {
      console.error(e instanceof Error ? e.stack : e);
    },
  );
  webhooksCompletePromise = webhooksCompletePromise.then(() => nextPromise);
}

/**
 * Webhooks return a 200 response when they've finished accepting the work implied by the event,
 * which often means they've successfully inserted the work into the database so it doesn't get
 * lost. They then kick off asynchronous tasks to finish the work. Tests often need to wait until
 * all of the asynchronous tasks are finished.
 *
 * When `webhookProcessingComplete()` is called, it effectively records the set of webhook events
 * that have returned their response before the call. It returns a `Promise` that will fulfil when
 * all the asynchronous work caused by those events has finished.
 */
export function webhookProcessingComplete(): Promise<void> {
  return webhooksCompletePromise;
}

export async function handleWebHook(request: Request): Promise<Response> {
  try {
    await webhooks.verifyAndReceive({
      id: request.headers.get("x-github-delivery") ?? "",
      // "as any" until https://github.com/octokit/webhooks.js/issues/1055 is fixed.
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      name: (request.headers.get("x-github-event") ?? "") as any,
      payload: await request.text(),
      signature: request.headers.get("X-Hub-Signature-256") ?? "",
    });

    return new Response(null, { status: 200 });
  } catch (e) {
    // eslint-disable-next-line no-ex-assign
    if (e instanceof AggregateError) e = e.errors[0];
    return new Response(
      e instanceof Error ? e.stack : "Unexpected webhook call.",
      { status: 400 },
    );
  }
}

export const POST: APIRoute = async ({ request }) => {
  return handleWebHook(request);
};
