import { lazy, Suspense } from "react";
import { HelpCircle, Image as ImageIcon } from "lucide-react";
import {
  EQUIPMENT_UNKNOWN_MESSAGE,
  formatEquipmentSelection,
  hasThreatRecorded,
  isAwaitingContext,
  isIssueConfirmMessage,
} from "./chatMessageUtils";

const ChatThreatRecordedBlock = lazy(() => import("./blocks/ChatThreatRecordedBlock"));
const ChatIssueConfirmBlock = lazy(() => import("./blocks/ChatIssueConfirmBlock"));
const ChatContextPromptBlock = lazy(() => import("./blocks/ChatContextPromptBlock"));
const ChatEquipmentSuggestionsBlock = lazy(() => import("./blocks/ChatEquipmentSuggestionsBlock"));

function BlockFallback() {
  return null;
}

/**
 * Unified assistant/user message body for ChatSidebar and MobileChat.
 * variant="sidebar" — Tailwind bubbles with full feature set.
 * variant="mobile" — inner content for scoped CSS wrappers.
 */
export function ChatMessageContent({
  msg,
  isInteractive = true,
  variant = "sidebar",
  t,
  isSending = false,
  autoSkipCountdown,
  onSendMessage,
  onReviseInput,
  onCancelFlow,
  onAddPhoto,
  onSkip,
  onThreatLinkClick,
  onEquipmentPrefill,
}) {
  const isMobile = variant === "mobile";

  if (msg.role === "user") {
    if (isMobile) {
      return <p>{msg.content}</p>;
    }
    return (
      <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 max-w-[85%] shadow-sm text-sm">
        {msg.has_image && msg.image_data && (
          <div className="mb-2 -mx-1 -mt-1">
            <img
              src={
                msg.image_data.startsWith("data:")
                  ? msg.image_data
                  : `data:image/jpeg;base64,${msg.image_data}`
              }
              alt="Attached"
              className="rounded-lg w-full max-h-60 object-contain bg-black/10"
            />
          </div>
        )}
        {msg.has_image && !msg.image_data && (
          <div className="mb-2 p-3 bg-blue-500/50 rounded-lg flex items-center gap-2 text-blue-100">
            <ImageIcon className="w-4 h-4" />
            <span className="text-xs">{t("chat.imageAttached")}</span>
          </div>
        )}
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    );
  }

  const isFollowUp =
    msg.question_type || (msg.content?.includes("?") && !hasThreatRecorded(msg));

  const assistantShell = (children) =>
    isMobile ? (
      <>{children}</>
    ) : (
      <div
        className={`bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm p-3 max-w-[90%] shadow-sm text-sm ${
          isFollowUp ? "border-l-4 border-l-blue-400" : ""
        }`}
      >
        {children}
      </div>
    );

  const acceptContent = isMobile ? "yes" : "accept";

  const handleRevise = () => {
    if (isMobile) {
      onSendMessage?.("revise");
    } else {
      onReviseInput?.();
    }
  };

  return assistantShell(
    <>
      {hasThreatRecorded(msg) && (
        <Suspense fallback={<BlockFallback />}>
          <ChatThreatRecordedBlock
            msg={msg}
            t={t}
            isMobile={isMobile}
            isInteractive={isInteractive}
            isSending={isSending}
            autoSkipCountdown={autoSkipCountdown}
            onThreatLinkClick={onThreatLinkClick}
            onAddPhoto={onAddPhoto}
            onSkip={onSkip}
          />
        </Suspense>
      )}

      {!hasThreatRecorded(msg) && isIssueConfirmMessage(msg) && (
        <Suspense fallback={<BlockFallback />}>
          <ChatIssueConfirmBlock
            msg={msg}
            t={t}
            isMobile={isMobile}
            isInteractive={isInteractive}
            isSending={isSending}
            onAccept={() => onSendMessage?.(acceptContent)}
            onRevise={handleRevise}
            onCancel={onCancelFlow}
          />
        </Suspense>
      )}

      {!hasThreatRecorded(msg) && !isIssueConfirmMessage(msg) && (
        <p className={isMobile ? undefined : "whitespace-pre-wrap"}>{msg.content}</p>
      )}

      {!hasThreatRecorded(msg) &&
        isInteractive &&
        isAwaitingContext(msg) &&
        !isIssueConfirmMessage(msg) && (
          <Suspense fallback={<BlockFallback />}>
            <ChatContextPromptBlock
              t={t}
              isMobile={isMobile}
              isSending={isSending}
              autoSkipCountdown={autoSkipCountdown}
              onAddPhoto={onAddPhoto}
              onSkip={onSkip}
              embedded={false}
            />
          </Suspense>
        )}

      {isInteractive && msg.equipment_suggestions?.length > 0 && (
        <Suspense fallback={<BlockFallback />}>
          <ChatEquipmentSuggestionsBlock
            suggestions={msg.equipment_suggestions}
            t={t}
            isMobile={isMobile}
            isSending={isSending}
            onSelect={(eq) => {
              if (isMobile) {
                onEquipmentPrefill?.(eq.name);
              } else {
                onSendMessage?.(formatEquipmentSelection(eq));
              }
            }}
            onUnknown={() => onSendMessage?.(EQUIPMENT_UNKNOWN_MESSAGE)}
            onCancel={isMobile ? undefined : onCancelFlow}
          />
        </Suspense>
      )}

      {!isMobile &&
        isInteractive &&
        isFollowUp &&
        !hasThreatRecorded(msg) &&
        !msg.equipment_suggestions?.length && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-blue-600 text-xs">
            <HelpCircle className="w-3 h-3" />
            <span>{t("chat.provideMoreDetails")}</span>
          </div>
        )}
    </>
  );
}

export function ChatMessageList({ messages, messageProps, wrapperClassName }) {
  return messages.map((msg, idx) => {
    if (msg.role === "user" && (msg.content || "").trim().toLowerCase() === "skip") {
      return null;
    }
    const isInteractive =
      msg.role === "assistant" && !messages.slice(idx + 1).some((m) => m.role === "assistant");

    const content = (
      <ChatMessageContent msg={msg} isInteractive={isInteractive} {...messageProps} />
    );

    if (messageProps.variant === "mobile") {
      const isUser = msg.role === "user";
      return (
        <div key={msg.id || idx} className={`chat-message ${isUser ? "user" : "assistant"}`}>
          <div className="message-bubble">{content}</div>
        </div>
      );
    }

    return (
      <div
        key={msg.id || idx}
        className={
          wrapperClassName?.(msg) ||
          `flex ${msg.role === "user" ? "justify-end" : "justify-start"}`
        }
      >
        {content}
      </div>
    );
  });
}
