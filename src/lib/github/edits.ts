import { query } from "@lib/github";
import { UpdateIssueBodyDocument } from "src/gql/graphql";

const COMMENT_SEPARATOR = `<!-- Content below this is maintained by @w3c-tag-bot -->
---`;

export async function addLinkToThisServerToIssue({
  id,
  org,
  repo,
  number,
  body,
}: {
  id: string;
  org: string;
  repo: string;
  number: number;
  body: string;
}): Promise<void> {
  const [humanBody] = body.split(COMMENT_SEPARATOR);
  const newBody = `${humanBody.trimEnd()}

${COMMENT_SEPARATOR}

Track conversations at ${import.meta.env.SITE}${import.meta.env.BASE_URL}gh/${org}/${repo}/${number}
`;

  await query(UpdateIssueBodyDocument, {id, body:newBody});
}
