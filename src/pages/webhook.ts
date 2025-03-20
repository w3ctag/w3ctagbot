import type { APIRoute } from "astro";
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
    return new Response(
      e instanceof Error ? e.message : "Unexpected webhook call.",
      { status: 400 },
    );
  }
}

export const POST: APIRoute = async ({ request }) => {
  return handleWebHook(request);
};
