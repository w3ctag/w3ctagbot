import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3(
  {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
  {
    timestampFormat: "unixepoch-ms",
  },
);

export const prisma: PrismaClient = new PrismaClient({ adapter });
