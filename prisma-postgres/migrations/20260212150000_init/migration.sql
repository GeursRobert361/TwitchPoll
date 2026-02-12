CREATE TYPE "PollState" AS ENUM ('DRAFT', 'LIVE', 'ENDED');
CREATE TYPE "VoteMode" AS ENUM ('NUMBERS', 'LETTERS', 'KEYWORDS');
CREATE TYPE "DuplicateVotePolicy" AS ENUM ('FIRST', 'LATEST');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "twitchUserId" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelWorkspace" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "channelLogin" TEXT NOT NULL,
  "channelDisplayName" TEXT NOT NULL,
  "channelTwitchUserId" TEXT,
  "overlaySlug" TEXT NOT NULL,
  "channelConfirmedAt" TIMESTAMP(3),
  "botFilterEnabled" BOOLEAN NOT NULL DEFAULT false,
  "blacklistJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Moderator" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Moderator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModInvite" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "moderatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Poll" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "voteMode" "VoteMode" NOT NULL,
  "state" "PollState" NOT NULL DEFAULT 'DRAFT',
  "duplicateVotePolicy" "DuplicateVotePolicy" NOT NULL DEFAULT 'LATEST',
  "allowVoteChange" BOOLEAN NOT NULL DEFAULT true,
  "durationSeconds" INTEGER,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdByRole" TEXT NOT NULL DEFAULT 'OWNER',
  "createdByLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PollOption" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vote" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "voterUserName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

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

ALTER TABLE "ChannelWorkspace" ADD CONSTRAINT "ChannelWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Moderator" ADD CONSTRAINT "Moderator_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModInvite" ADD CONSTRAINT "ModInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModInvite" ADD CONSTRAINT "ModInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModInvite" ADD CONSTRAINT "ModInvite_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "Moderator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ChannelWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

