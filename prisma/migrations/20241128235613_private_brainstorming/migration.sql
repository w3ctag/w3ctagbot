/*
  Warnings:

  - A unique constraint covering the columns `[privateBrainstormingIssueId]` on the table `DesignReview` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DesignReview" ADD COLUMN "pendingCommentsFrom" TEXT;
ALTER TABLE "DesignReview" ADD COLUMN "pendingPrivateBrainstormingCommentsFrom" TEXT;
ALTER TABLE "DesignReview" ADD COLUMN "privateBrainstormingIssueId" TEXT;

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "url" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "isMinimized" BOOLEAN NOT NULL,
    "isPrivateBrainstorming" BOOLEAN NOT NULL,
    CONSTRAINT "ReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "DesignReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "GithubUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignReview_privateBrainstormingIssueId_key" ON "DesignReview"("privateBrainstormingIssueId");
