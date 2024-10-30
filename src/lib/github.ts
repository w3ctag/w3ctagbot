import { TypedDocumentString } from "../gql/graphql";
import { installationOctokit } from "./github/auth.js";

export async function query<TData, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables,
): Promise<TData> {
  return (await installationOctokit()).graphql<TData>(operation.toString(), {
    ...variables,
  });
}

export async function pagedQuery<TData extends object, TVariables>(
  operation: TypedDocumentString<TData, TVariables>,
  variables?: TVariables,
): Promise<TData> {
  return (await installationOctokit()).graphql.paginate<TData>(
    operation.toString(),
    { ...variables },
  );
}
