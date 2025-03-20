-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "org" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "milestoneId" TEXT,
    "created" DATETIME NOT NULL,
    "updated" DATETIME NOT NULL,
    "closed" DATETIME,
    "pendingCommentsFrom" TEXT,
    CONSTRAINT "Issue_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DesignReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "privateBrainstormingIssueId" TEXT,
    "pendingPrivateBrainstormingCommentsFrom" TEXT,
    CONSTRAINT "DesignReview_id_fkey" FOREIGN KEY ("id") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Label" (
    "issueId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "Label_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "dueOn" DATETIME
);

-- CreateTable
CREATE TABLE "IssueComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "url" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "isMinimized" BOOLEAN NOT NULL,
    "isPrivateBrainstorming" BOOLEAN NOT NULL,
    CONSTRAINT "IssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IssueComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "GithubUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    "issueId" TEXT NOT NULL,
    "meetingYear" INTEGER NOT NULL,
    "meetingName" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    CONSTRAINT "Discussion_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Discussion_meetingYear_meetingName_fkey" FOREIGN KEY ("meetingYear", "meetingName") REFERENCES "Meeting" ("year", "name") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProposedComment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discussionId" INTEGER,
    "markdown" TEXT NOT NULL,
    CONSTRAINT "ProposedComment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GithubUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpires" DATETIME,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "GithubUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Issue_org_repo_number_key" ON "Issue"("org", "repo", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DesignReview_privateBrainstormingIssueId_key" ON "DesignReview"("privateBrainstormingIssueId");

-- CreateIndex
CREATE UNIQUE INDEX "Label_issueId_labelId_key" ON "Label"("issueId", "labelId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_year_name_key" ON "Meeting"("year", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSession_meetingYear_meetingName_type_key" ON "MeetingSession"("meetingYear", "meetingName", "type");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_sessionId_attendeeId_key" ON "MeetingAttendee"("sessionId", "attendeeId");
