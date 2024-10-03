# Github bot for the W3C TAG

To get started with development:

1. Copy `.env.default` to `.env` to tell Prisma where to look for its Sqlite database file.
2. Run `GITHUB_TOKEN=$(gh auth token) pnpm run dev` to start the development server. (You can use a
   different GITHUB_TOKEN if you prefer and/or embed this token in `.env`.)
3. Open http://localhost:4321/ to see the current site.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command               | Action                                       |
| :-------------------- | :------------------------------------------- |
| `pnpm dev`            | Starts local dev server at `localhost:4321`  |
| `pnpm build`          | Build your production site to `./dist/`      |
| `pnpm preview`        | Preview your build locally, before deploying |
| `pnpm codegen`        | Regenerate Prisma and Graphql code           |
| `pnpm prisma db push` | Update the development database schema       |

## Dependencies

- [Astro](https://docs.astro.build) for the main site architecture. It's configured for server-side
  rendering, and I expect to turn on a client-side
  [integration](https://docs.astro.build/en/guides/integrations-guide/lit/) for client-side
  components.
- [Prisma](https://www.prisma.io/docs/orm) for type-safe database management.
- [Graphql Codegen](https://the-guild.dev/graphql/codegen/docs/getting-started) to type-check calls
  to [Github's GraphQL API](https://docs.github.com/en/graphql).
