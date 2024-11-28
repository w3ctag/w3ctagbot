
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: "node_modules/@octokit/graphql-schema/schema.graphql",
  documents: ["github-gql/*.graphql"],
  generates: {
    "src/gql/": {
      preset: "client",
      presetConfig: {
        fragmentMasking: false
      },
      config: {
        useTypeImports: true,
        documentMode: "string",
      },
    },
  },
};

export default config;
