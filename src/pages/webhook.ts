import type { APIRoute } from "astro";
import { REVIEWS_REPO } from "astro:env/client";
import { app } from "../lib/github";
import { prisma } from "../lib/prisma";

app.webhooks.on("issues.opened", async ({ payload }) => {
  if (payload.repository.full_name !== REVIEWS_REPO) return;
  await prisma.designReview.create({
    data: {
      id: payload.issue.node_id,
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

app.webhooks.on(["issues.closed", "issues.reopened"], async ({ payload }) => {
  await prisma.designReview.update({
    where: {
      id: payload.issue.node_id,
    },
    data: {
      updated: payload.issue.updated_at,
      closed: payload.issue.closed_at,
    },
  });
});

app.webhooks.on("issues.edited", async ({ payload }) => {
  await prisma.designReview.update({
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

app.webhooks.on("issues.labeled", async ({ payload }) => {
  if (!payload.label) return;
  await prisma.reviewLabel.upsert({
    where: {
      reviewId_labelId: {
        reviewId: payload.issue.node_id,
        labelId: payload.label.node_id,
      },
    },
    create: {
      reviewId: payload.issue.node_id,
      label: payload.label.name,
      labelId: payload.label.node_id,
    },
    update: {},
  });
});

app.webhooks.on("issues.unlabeled", async ({ payload }) => {
  if (!payload.label) return;
  await prisma.reviewLabel.delete({
    where: {
      reviewId_labelId: {
        reviewId: payload.issue.node_id,
        labelId: payload.label.node_id,
      },
    },
  });
});

export async function handleWebHook(request: Request): Promise<Response> {
  try {
    await app.webhooks.verifyAndReceive({
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
