-- CreateTable
CREATE TABLE "DesignReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created" DATETIME NOT NULL,
    "updated" DATETIME NOT NULL,
    "closed" DATETIME
);

-- CreateTable
CREATE TABLE "ReviewLabel" (
    "reviewId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "ReviewLabel_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "DesignReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignReview_number_key" ON "DesignReview"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLabel_reviewId_labelId_key" ON "ReviewLabel"("reviewId", "labelId");
