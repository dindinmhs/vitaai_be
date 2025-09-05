-- AlterTable
ALTER TABLE "public"."Conversation" ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'New Conversation';

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "public"."Conversation"("userId");

-- CreateIndex
CREATE INDEX "Conversation_title_idx" ON "public"."Conversation"("title");
