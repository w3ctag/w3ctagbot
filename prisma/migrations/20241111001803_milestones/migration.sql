-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "dueOn" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DesignReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "milestoneId" TEXT,
    "created" DATETIME NOT NULL,
    "updated" DATETIME NOT NULL,
    "closed" DATETIME,
    CONSTRAINT "DesignReview_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DesignReview" ("body", "closed", "created", "id", "number", "title", "updated") SELECT "body", "closed", "created", "id", "number", "title", "updated" FROM "DesignReview";
DROP TABLE "DesignReview";
ALTER TABLE "new_DesignReview" RENAME TO "DesignReview";
CREATE UNIQUE INDEX "DesignReview_number_key" ON "DesignReview"("number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
