import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { REVIEWS_REPO } from "astro:env/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { app } from "../src/lib/github";
import { prisma } from "../src/lib/prisma";
import { handleWebHook } from "../src/pages/webhook";

beforeEach(async () => {
  await prisma.designReview.deleteMany();
});
afterEach(async () => {
  await prisma.designReview.deleteMany();
});

describe("issues", () => {
  describe("opened", () => {
    test("creates the issue in the database", async () => {
      const body =
        "こんにちは TAG-さん!\r\n\r\nI'm requesting a TAG review of Test feature.\r\n\r\nExplainer\r\n\r\n  - Explainer¹ (minimally containing user needs and example code): http://go/this-link-is-private\r\n  - Specification URL: [specification link](https://docs.google.com/document/d/1zEP8y1aWd3LSsX7tiHUf3nlLbyYF2LznlZ_pZ-ErWpc/edit)\r\n  - Tests: [wpt folder(s), if available]\r\n  - User research: [url to public summary/results of research]\r\n  - Security and Privacy self-review²: [url]\r\n  - GitHub repo: [url]\r\n  - Primary contacts (and their relationship to the specification):\r\n      - [name] ([github username]), [organization/s] (repeat as necessary, we recommend including group chairs and editors in this list)\r\n  - Organization(s)/project(s) driving the specification: [organization and/or project name]\r\n  - Key pieces of existing multi-stakeholder (e.g. developers, implementers, civil society) support, review or discussion of this specification\r\n  - Key pieces of multi-implementer support:\r\n    - Chromium comments: [url]\r\n    - Mozilla comments: https://github.com/mozilla/standards-positions/issues/NNN\r\n    - WebKit comments: https://github.com/WebKit/standards-positions/issues/NNN\r\n    - etc...\r\n  - External status/issue trackers for this specification (publicly visible, e.g. Chrome Status):\r\n\r\nFurther details:\r\n\r\n  - [ ] I have reviewed the TAG's [Web Platform Design Principles](https://www.w3.org/TR/design-principles/)\r\n  - Relevant time constraints or deadlines: [please provide]\r\n  - The group where the work on this specification is currently being done:\r\n  - The group where standardization of this work is intended to be done (if current group is a community group or other incubation venue):\r\n  - Major unresolved issues with or opposition to this specification:\r\n  - This work is being funded by:\r\n\r\nYou should also know that...\r\n\r\n[please tell us anything you think is relevant to this review]\r\n";
      const payload = JSON.stringify({
        action: "opened",
        issue: {
          url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/9`,
          repository_url: `https://api.github.com/repos/${REVIEWS_REPO}`,
          labels_url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/9/labels{/name}`,
          comments_url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/9/comments`,
          events_url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/9/events`,
          html_url: `https://github.com/${REVIEWS_REPO}/issues/9`,
          id: 2539552022,
          node_id: "Issue9Id",
          number: 9,
          title: "Test specification review",
          user: {
            login: "jyasskin",
            id: 83420,
            node_id: "MDQ6VXNlcjgzNDIw",
            avatar_url: "https://avatars.githubusercontent.com/u/83420?v=4",
            gravatar_id: "",
            url: "https://api.github.com/users/jyasskin",
            html_url: "https://github.com/jyasskin",
            type: "User",
            site_admin: false,
          },
          labels: [
            {
              color: "ff0000",
              default: false,
              description: null,
              id: 1,
              name: "Label 1",
              node_id: "Label Node Id",
              url: "",
            },
            {
              color: "00ff00",
              default: false,
              description: null,
              id: 1,
              name: "Label 2",
              node_id: "Label2 Node Id",
              url: "",
            },
          ],
          state: "open",
          locked: false,
          assignee: null,
          assignees: [],
          milestone: null,
          comments: 0,
          created_at: "2024-09-20T19:38:15Z",
          updated_at: "2024-09-20T19:38:15Z",
          closed_at: null,
          author_association: "OWNER",
          active_lock_reason: null,
          body,
          reactions: {
            url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/9/reactions`,
            total_count: 0,
            "+1": 0,
            "-1": 0,
            laugh: 0,
            hooray: 0,
            confused: 0,
            heart: 0,
            rocket: 0,
            eyes: 0,
          },
          timeline_url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/9/timeline`,
          performed_via_github_app: null,
          state_reason: null,
        },
        repository: {
          id: 849574210,
          node_id: "R_kgDOMqN5Qg",
          name: "test-design-reviews",
          full_name: REVIEWS_REPO,
          private: false,
          owner: {
            login: "jyasskin",
            id: 83420,
            node_id: "MDQ6VXNlcjgzNDIw",
            avatar_url: "https://avatars.githubusercontent.com/u/83420?v=4",
            gravatar_id: "",
            url: "https://api.github.com/users/jyasskin",
            html_url: "https://github.com/jyasskin",
            followers_url: "https://api.github.com/users/jyasskin/followers",
            following_url:
              "https://api.github.com/users/jyasskin/following{/other_user}",
            gists_url: "https://api.github.com/users/jyasskin/gists{/gist_id}",
            starred_url:
              "https://api.github.com/users/jyasskin/starred{/owner}{/repo}",
            subscriptions_url:
              "https://api.github.com/users/jyasskin/subscriptions",
            organizations_url: "https://api.github.com/users/jyasskin/orgs",
            repos_url: "https://api.github.com/users/jyasskin/repos",
            events_url:
              "https://api.github.com/users/jyasskin/events{/privacy}",
            received_events_url:
              "https://api.github.com/users/jyasskin/received_events",
            type: "User",
            site_admin: false,
          },
          html_url: `https://github.com/${REVIEWS_REPO}`,
          description: "Repository to test cloning design-reviews issues",
          fork: false,
          url: `https://api.github.com/repos/${REVIEWS_REPO}`,
          forks_url: `https://api.github.com/repos/${REVIEWS_REPO}/forks`,
          keys_url: `https://api.github.com/repos/${REVIEWS_REPO}/keys{/key_id}`,
          collaborators_url: `https://api.github.com/repos/${REVIEWS_REPO}/collaborators{/collaborator}`,
          teams_url: `https://api.github.com/repos/${REVIEWS_REPO}/teams`,
          hooks_url: `https://api.github.com/repos/${REVIEWS_REPO}/hooks`,
          issue_events_url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/events{/number}`,
          events_url: `https://api.github.com/repos/${REVIEWS_REPO}/events`,
          assignees_url: `https://api.github.com/repos/${REVIEWS_REPO}/assignees{/user}`,
          branches_url: `https://api.github.com/repos/${REVIEWS_REPO}/branches{/branch}`,
          tags_url: `https://api.github.com/repos/${REVIEWS_REPO}/tags`,
          blobs_url: `https://api.github.com/repos/${REVIEWS_REPO}/git/blobs{/sha}`,
          git_tags_url: `https://api.github.com/repos/${REVIEWS_REPO}/git/tags{/sha}`,
          git_refs_url: `https://api.github.com/repos/${REVIEWS_REPO}/git/refs{/sha}`,
          trees_url: `https://api.github.com/repos/${REVIEWS_REPO}/git/trees{/sha}`,
          statuses_url: `https://api.github.com/repos/${REVIEWS_REPO}/statuses/{sha}`,
          languages_url: `https://api.github.com/repos/${REVIEWS_REPO}/languages`,
          stargazers_url: `https://api.github.com/repos/${REVIEWS_REPO}/stargazers`,
          contributors_url: `https://api.github.com/repos/${REVIEWS_REPO}/contributors`,
          subscribers_url: `https://api.github.com/repos/${REVIEWS_REPO}/subscribers`,
          subscription_url: `https://api.github.com/repos/${REVIEWS_REPO}/subscription`,
          commits_url: `https://api.github.com/repos/${REVIEWS_REPO}/commits{/sha}`,
          git_commits_url: `https://api.github.com/repos/${REVIEWS_REPO}/git/commits{/sha}`,
          comments_url: `https://api.github.com/repos/${REVIEWS_REPO}/comments{/number}`,
          issue_comment_url: `https://api.github.com/repos/${REVIEWS_REPO}/issues/comments{/number}`,
          contents_url: `https://api.github.com/repos/${REVIEWS_REPO}/contents/{+path}`,
          compare_url: `https://api.github.com/repos/${REVIEWS_REPO}/compare/{base}...{head}`,
          merges_url: `https://api.github.com/repos/${REVIEWS_REPO}/merges`,
          archive_url: `https://api.github.com/repos/${REVIEWS_REPO}/{archive_format}{/ref}`,
          downloads_url: `https://api.github.com/repos/${REVIEWS_REPO}/downloads`,
          issues_url: `https://api.github.com/repos/${REVIEWS_REPO}/issues{/number}`,
          pulls_url: `https://api.github.com/repos/${REVIEWS_REPO}/pulls{/number}`,
          milestones_url: `https://api.github.com/repos/${REVIEWS_REPO}/milestones{/number}`,
          notifications_url: `https://api.github.com/repos/${REVIEWS_REPO}/notifications{?since,all,participating}`,
          labels_url: `https://api.github.com/repos/${REVIEWS_REPO}/labels{/name}`,
          releases_url: `https://api.github.com/repos/${REVIEWS_REPO}/releases{/id}`,
          deployments_url: `https://api.github.com/repos/${REVIEWS_REPO}/deployments`,
          created_at: "2024-08-29T20:54:51Z",
          updated_at: "2024-08-30T17:23:30Z",
          pushed_at: "2024-08-30T17:23:27Z",
          git_url: `git://github.com/${REVIEWS_REPO}.git`,
          ssh_url: `git@github.com:${REVIEWS_REPO}.git`,
          clone_url: `https://github.com/${REVIEWS_REPO}.git`,
          svn_url: `https://github.com/${REVIEWS_REPO}`,
          homepage: null,
          size: 11,
          stargazers_count: 0,
          watchers_count: 0,
          language: null,
          has_issues: true,
          has_projects: true,
          has_downloads: true,
          has_wiki: true,
          has_pages: false,
          has_discussions: true,
          forks_count: 0,
          mirror_url: null,
          archived: false,
          disabled: false,
          open_issues_count: 8,
          license: null,
          allow_forking: true,
          is_template: false,
          web_commit_signoff_required: false,
          topics: [],
          visibility: "public",
          forks: 0,
          open_issues: 8,
          watchers: 0,
          default_branch: "main",
        },
        sender: {
          login: "jyasskin",
          id: 83420,
          node_id: "MDQ6VXNlcjgzNDIw",
          avatar_url: "https://avatars.githubusercontent.com/u/83420?v=4",
          gravatar_id: "",
          url: "https://api.github.com/users/jyasskin",
          html_url: "https://github.com/jyasskin",
          followers_url: "https://api.github.com/users/jyasskin/followers",
          following_url:
            "https://api.github.com/users/jyasskin/following{/other_user}",
          gists_url: "https://api.github.com/users/jyasskin/gists{/gist_id}",
          starred_url:
            "https://api.github.com/users/jyasskin/starred{/owner}{/repo}",
          subscriptions_url:
            "https://api.github.com/users/jyasskin/subscriptions",
          organizations_url: "https://api.github.com/users/jyasskin/orgs",
          repos_url: "https://api.github.com/users/jyasskin/repos",
          events_url: "https://api.github.com/users/jyasskin/events{/privacy}",
          received_events_url:
            "https://api.github.com/users/jyasskin/received_events",
          type: "User",
          site_admin: false,
        },
      } satisfies EmitterWebhookEvent<"issues.opened">["payload"]);
      const response = await handleWebHook(
        new Request("https://example.com/webhook", {
          method: "POST",
          headers: {
            "x-github-delivery": "unique id",
            "x-github-event": "issues",
            "X-Hub-Signature-256": await app.webhooks.sign(payload),
          },
          body: payload,
        }),
      );
      expect(await response.text()).toEqual("");
      expect(response).toHaveProperty("status", 200);
      const result = await prisma.designReview.findUniqueOrThrow({
        where: { id: "Issue9Id" },
        include: { labels: { select: { label: true } } },
      });
      expect(result).toEqual({
        id: "Issue9Id",
        number: 9,
        title: "Test specification review",
        body,
        created: new Date("2024-09-20T19:38:15"),
        updated: new Date("2024-09-20T19:38:15"),
        closed: null,
        labels: [{ label: "Label 1" }, { label: "Label 2" }],
      } satisfies typeof result);
    });
  });
});
