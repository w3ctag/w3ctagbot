-- CreateTable
CREATE TABLE "Meeting" (
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "minutesUrl" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "cachedMinutesId" TEXT,
    "contents" TEXT
);

-- CreateTable
CREATE TABLE "MeetingSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "meetingYear" INTEGER NOT NULL,
    "meetingName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "MeetingSession_meetingYear_meetingName_fkey" FOREIGN KEY ("meetingYear", "meetingName") REFERENCES "Meeting" ("year", "name") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "sessionId" INTEGER NOT NULL,
    "attendeeId" TEXT NOT NULL,
    CONSTRAINT "MeetingAttendee_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MeetingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Discussion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "designReviewId" TEXT NOT NULL,
    "meetingYear" INTEGER NOT NULL,
    "meetingName" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    CONSTRAINT "Discussion_designReviewId_fkey" FOREIGN KEY ("designReviewId") REFERENCES "DesignReview" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Discussion_meetingYear_meetingName_fkey" FOREIGN KEY ("meetingYear", "meetingName") REFERENCES "Meeting" ("year", "name") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProposedComment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discussionId" INTEGER,
    "markdown" TEXT NOT NULL,
    CONSTRAINT "ProposedComment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_year_name_key" ON "Meeting"("year", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSession_meetingYear_meetingName_type_key" ON "MeetingSession"("meetingYear", "meetingName", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_sessionId_attendeeId_key" ON "MeetingAttendee"("sessionId", "attendeeId");
