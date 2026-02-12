-- CreateTable
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "twitchUserId" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChannelWorkspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "channelLogin" TEXT NOT NULL,
  "channelDisplayName" TEXT NOT NULL,
  "channelTwitchUserId" TEXT,
  "overlaySlug" TEXT NOT NULL,
  "channelConfirmedAt" DATETIME,
  "botFilterEnabled" BOOLEAN NOT NULL DEFAULT false,
  "blacklistJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ChannelWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Moderator" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "revokedAt" DATETIME,
  "lastSeenAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Moderator_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModInvite" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "revokedAt" DATETIME,
  "moderatorId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ModInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ModInvite_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "Moderator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Poll" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "voteMode" TEXT NOT NULL CHECK ("voteMode" IN ('NUMBERS', 'LETTERS', 'KEYWORDS')),
  "state" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("state" IN ('DRAFT', 'LIVE', 'ENDED')),
  "duplicateVotePolicy" TEXT NOT NULL DEFAULT 'LATEST' CHECK ("duplicateVotePolicy" IN ('FIRST', 'LATEST')),
  "allowVoteChange" BOOLEAN NOT NULL DEFAULT true,
  "durationSeconds" INTEGER,
  "startsAt" DATETIME,
  "endsAt" DATETIME,
  "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdByRole" TEXT NOT NULL DEFAULT 'OWNER',
  "createdByLabel" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Poll_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PollOption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pollId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pollId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "voterUserName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_twitchUserId_key" ON "User"("twitchUserId");
CREATE UNIQUE INDEX "ChannelWorkspace_overlaySlug_key" ON "ChannelWorkspace"("overlaySlug");
CREATE UNIQUE INDEX "ChannelWorkspace_ownerId_channelLogin_key" ON "ChannelWorkspace"("ownerId", "channelLogin");
CREATE UNIQUE INDEX "ModInvite_tokenHash_key" ON "ModInvite"("tokenHash");
CREATE INDEX "Poll_workspaceId_state_idx" ON "Poll"("workspaceId", "state");
CREATE INDEX "Poll_endsAt_idx" ON "Poll"("endsAt");
CREATE UNIQUE INDEX "PollOption_pollId_position_key" ON "PollOption"("pollId", "position");
CREATE UNIQUE INDEX "PollOption_pollId_keyword_key" ON "PollOption"("pollId", "keyword");
CREATE UNIQUE INDEX "Vote_pollId_voterUserName_key" ON "Vote"("pollId", "voterUserName");
CREATE INDEX "Vote_pollId_idx" ON "Vote"("pollId");

