-- CreateTable
CREATE TABLE "_IssueAssignment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_IssueAssignment_A_fkey" FOREIGN KEY ("A") REFERENCES "GithubUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_IssueAssignment_B_fkey" FOREIGN KEY ("B") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Issue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "org" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "milestoneId" TEXT,
    "created" DATETIME NOT NULL,
    "updated" DATETIME NOT NULL,
    "cacheUpdated" DATETIME NOT NULL DEFAULT '0000-01-01 00:00:00 +00:00',
    "closed" DATETIME,
    "pendingCommentsFrom" TEXT,
    CONSTRAINT "Issue_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Issue" ("body", "closed", "created", "id", "milestoneId", "number", "org", "pendingCommentsFrom", "repo", "title", "updated") SELECT "body", "closed", "created", "id", "milestoneId", "number", "org", "pendingCommentsFrom", "repo", "title", "updated" FROM "Issue";
DROP TABLE "Issue";
ALTER TABLE "new_Issue" RENAME TO "Issue";
CREATE UNIQUE INDEX "Issue_org_repo_number_key" ON "Issue"("org", "repo", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_IssueAssignment_AB_unique" ON "_IssueAssignment"("A", "B");

-- CreateIndex
CREATE INDEX "_IssueAssignment_B_index" ON "_IssueAssignment"("B");
