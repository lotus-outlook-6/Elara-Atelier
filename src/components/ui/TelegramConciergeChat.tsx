/**
 * Direct two-way Concierge Chat panel synced between the Patient Profile and the Telegram Bot.
 * Allows signed-in patients to send messages directly to @ElaraAtelierBot or read replies synced via SSE.
 */

import React, { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import type { ConciergeChatMessage } from '../../context/AuthContext';

export interface TelegramConciergeChatProps {
  botUsername: string;
  linkedChatId: string | null;
  messages: ConciergeChatMessage[];
  loading: boolean;
  onSendMessage: (text: string) => Promise<{ sentToTelegram: boolean }>;
}

/**
 * Render an inline chronological concierge message list and direct send composer.
 * Inputs: TelegramConciergeChatProps.
 * Output: Rendered React component.
 */
export const TelegramConciergeChat: React.FC<TelegramConciergeChatProps> = ({
  botUsername,
  linkedChatId,
  messages,
  loading,
  onSendMessage,
}) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  /**
   * Format message timestamp cleanly for compact thread display.
   * Inputs: createdAtMs epoch timestamp.
   * Output: short formatted clock string.
   */
  const formatTime = (createdAtMs: number): string => {
    try {
      return new Date(createdAtMs).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  /**
   * Submit a direct concierge message from the Profile input box.
   * Inputs: React.FormEvent.
   */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = draft.trim();
    if (!cleaned || sending) return;

    setSending(true);
    setError(null);
    setStatusNote(null);
    try {
      const result = await onSendMessage(cleaned);
      setDraft('');
      setStatusNote(
        result.sentToTelegram
          ? `Delivered to your @${botUsername} Telegram chat.`
          : 'Saved to your concierge desk. Open the Telegram bot once to receive live chat pushes.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message right now.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-5 border-t border-[#E2D9CE] pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
          <MessageSquare className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
          <span>Direct Concierge Chat</span>
        </div>
        <span className="text-[11px] font-medium text-[#6E655F]">
          {linkedChatId ? 'Telegram Linked' : 'Web & Telegram Sync'}
        </span>
      </div>

      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-3">
        {loading ? (
          <p className="py-4 text-center text-xs text-[#6E655F]">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-3 text-xs leading-relaxed text-[#6E655F]">
            Send a direct message below to ask about treatments, pricing, or visit timing—or text{' '}
            <span className="font-medium text-[#1F1B18]">@{botUsername}</span> on Telegram anytime.
          </p>
        ) : (
          messages.slice(-12).map(msg => {
            const isPatient = msg.sender === 'patient';
            return (
              <div
                key={msg.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  isPatient
                    ? 'ml-6 border-[#1F1B18]/15 bg-[#EFE9E0] text-[#1F1B18]'
                    : 'mr-6 border-[#B68D5E]/40 bg-[#FAF7F2] text-[#1F1B18]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.08em] text-[#6E655F] uppercase">
                  <span>{isPatient ? 'You' : 'Elara Concierge'}</span>
                  <span className="tabular-nums">{formatTime(msg.createdAtMs)}</span>
                </div>
                <p className="mt-1 leading-relaxed break-words text-[#1F1B18]">{msg.text}</p>
              </div>
            );
          })
        )}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-[#9E3B33]" role="alert">
          {error}
        </p>
      ) : statusNote ? (
        <p className="mt-2 text-xs text-[#4B6B50]">{statusNote}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Message our concierge directly…"
          maxLength={1000}
          aria-label="Message our concierge directly"
          className="h-10 w-full rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-xs text-[#1F1B18] placeholder-[#6E655F]/70 outline-none transition-colors focus:border-[#B68D5E]"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send concierge message"
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#1F1B18] px-3.5 text-xs font-semibold tracking-[0.1em] text-[#FAF7F2] uppercase transition-colors hover:bg-[#352F2B] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
          {sending ? 'Sending' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default TelegramConciergeChat;
