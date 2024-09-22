/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 */
const documents = {
    "query RecentDesignReviews($owner: String!, $repo: String!, $since: DateTime, $cursor: String) {\n  repository(owner: $owner, name: $repo) {\n    issues(\n      states: [OPEN, CLOSED]\n      first: 100\n      filterBy: {since: $since}\n      after: $cursor\n    ) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      nodes {\n        id\n        number\n        title\n        body\n        createdAt\n        updatedAt\n        closedAt\n        labels(first: 100) {\n          totalCount\n          nodes {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n}": types.RecentDesignReviewsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "query RecentDesignReviews($owner: String!, $repo: String!, $since: DateTime, $cursor: String) {\n  repository(owner: $owner, name: $repo) {\n    issues(\n      states: [OPEN, CLOSED]\n      first: 100\n      filterBy: {since: $since}\n      after: $cursor\n    ) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      nodes {\n        id\n        number\n        title\n        body\n        createdAt\n        updatedAt\n        closedAt\n        labels(first: 100) {\n          totalCount\n          nodes {\n            id\n            name\n          }\n        }\n      }\n    }\n  }\n}"): typeof import('./graphql').RecentDesignReviewsDocument;


export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}
