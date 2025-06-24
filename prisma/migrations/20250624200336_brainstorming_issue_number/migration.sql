/*
  Warnings:

  - A unique constraint covering the columns `[privateBrainstormingIssueNumber]` on the table `DesignReview` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DesignReview" ADD COLUMN "privateBrainstormingIssueNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "DesignReview_privateBrainstormingIssueNumber_key" ON "DesignReview"("privateBrainstormingIssueNumber");
