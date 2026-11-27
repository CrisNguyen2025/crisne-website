import React from "react";
import type { RoadmapChatClient } from "../../client";
import type { GmailConnectorStatus, ThreadSummary } from "../../types";
import type { ConversationContextState } from "../useRoadmapAssistantChat";
import type { VoteDetail } from "../useFeedback";
import type { PageContextRef } from "../utils/pageContextRef";
import { ContextUsageSheet } from "./ContextUsageSheet";
import { FeedbackReasonSheet } from "./FeedbackReasonSheet";
import { GmailConnectorDialog } from "./GmailConnectorDialog";
import { OwnerMemorySheet } from "./OwnerMemorySheet";
import { ThreadHistorySheet } from "./ThreadHistorySheet";

export interface WidgetModalsProps {
  activeModal: "context" | "memory" | "history" | "gmail" | null;
  modalSeq: number;
  modalZIndex: number;
  canWrite: boolean;
  baseUrl: string;
  currentTopicSlug?: string;
  conversationContext: ConversationContextState;
  activeContextRef: PageContextRef | null;
  refreshContext: () => Promise<void>;
  setPendingMemoryCount: (count: number) => void;
  historyThreads: ThreadSummary[];
  historyQuery: string;
  setHistoryQuery: (q: string) => void;
  isHistoryLoading: boolean;
  isHistorySearching: boolean;
  historyError: string | null;
  deletingHistoryId: string | null;
  conversationId: string;
  refreshHistory: () => Promise<void>;
  onSelectHistoryThread: (id: string) => Promise<boolean>;
  onDeleteHistoryThread: (id: string) => Promise<boolean>;
  closeHistorySheet: () => void;
  client: RoadmapChatClient;
  gmailStatus: GmailConnectorStatus | null;
  isGmailAttached: boolean;
  setGmailStatus: (status: GmailConnectorStatus) => void;
  setIsGmailAttached: (attached: boolean) => void;
  onCloseModal: () => void;
  activeFeedbackMsgId: string | null;
  setSheetDraft: (draft: VoteDetail) => void;
  commitFeedback: (msgId: string, detail?: VoteDetail) => Promise<void>;
  onCloseFeedback: () => void;
}

export function WidgetModals({
  activeModal,
  modalSeq,
  modalZIndex,
  canWrite,
  baseUrl,
  currentTopicSlug,
  conversationContext,
  activeContextRef,
  refreshContext,
  setPendingMemoryCount,
  historyThreads,
  historyQuery,
  setHistoryQuery,
  isHistoryLoading,
  isHistorySearching,
  historyError,
  deletingHistoryId,
  conversationId,
  refreshHistory,
  onSelectHistoryThread,
  onDeleteHistoryThread,
  closeHistorySheet,
  client,
  gmailStatus,
  isGmailAttached,
  setGmailStatus,
  setIsGmailAttached,
  onCloseModal,
  activeFeedbackMsgId,
  setSheetDraft,
  commitFeedback,
  onCloseFeedback,
}: WidgetModalsProps) {
  return (
    <>
      {activeModal === "context" && (
        <ContextUsageSheet
          key={`context-${modalSeq}`}
          context={conversationContext}
          contextRef={activeContextRef}
          zIndex={modalZIndex}
          onRetry={() => void refreshContext()}
          onClose={onCloseModal}
        />
      )}
      {canWrite && activeModal === "memory" && (
        <OwnerMemorySheet
          key={`memory-${modalSeq}`}
          baseUrl={baseUrl}
          currentTopicSlug={currentTopicSlug}
          zIndex={modalZIndex}
          onPendingCountChange={setPendingMemoryCount}
          onClose={onCloseModal}
        />
      )}
      {canWrite && activeModal === "history" && (
        <ThreadHistorySheet
          key={`history-${modalSeq}`}
          threads={historyThreads}
          query={historyQuery}
          onQueryChange={setHistoryQuery}
          isLoading={isHistoryLoading}
          isSearching={isHistorySearching}
          error={historyError}
          deletingId={deletingHistoryId}
          currentThreadId={conversationId}
          zIndex={modalZIndex}
          onRetry={() => void refreshHistory()}
          onSelectThread={onSelectHistoryThread}
          onDeleteThread={onDeleteHistoryThread}
          onClose={closeHistorySheet}
        />
      )}
      {canWrite && activeModal === "gmail" && (
        <GmailConnectorDialog
          key={`gmail-${modalSeq}`}
          client={client}
          initialStatus={gmailStatus}
          isGmailAttached={isGmailAttached}
          zIndex={modalZIndex}
          onStatusChange={setGmailStatus}
          onToggleAttached={setIsGmailAttached}
          onClose={onCloseModal}
        />
      )}
      {activeFeedbackMsgId && (
        <FeedbackReasonSheet
          key={activeFeedbackMsgId}
          messageId={activeFeedbackMsgId}
          onDraftChange={(reason, comment) => setSheetDraft({ reason, comment })}
          onSubmit={(reason, comment) => void commitFeedback(activeFeedbackMsgId, { reason, comment })}
          onClose={onCloseFeedback}
        />
      )}
    </>
  );
}
