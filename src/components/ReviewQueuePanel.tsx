import { useState } from 'react'
import { buildQueue, overflowCount, waitingLabel, type QueueItem } from '../utils/reviewQueue'

/**
 * What applying a proposal gives back. An `undo` means the change can be
 * taken back from the receipt below; its absence means it cannot, and the
 * receipt says so rather than offering a button that does nothing.
 */
export interface ApplyResult { undo?: () => void }

interface Receipt { id: string; title: string; undo?: () => void }

/**
 * The review queue, in Coach — the permanent home of every proposal.
 *
 * These used to be cards on Today that vanished if you missed them and
 * came back tomorrow if you didn't. Here they wait, visibly, until the
 * athlete decides — and if they wait too long they expire rather than
 * accusing forever.
 */
export default function ReviewQueuePanel({ items, onApply, onSnooze, now }: {
  items: QueueItem[]
  onApply: (item: QueueItem) => ApplyResult | void
  onSnooze: (item: QueueItem) => void
  now?: number
}) {
  const queue = buildQueue(items, now)
  const overflow = overflowCount(items, now)
  // An applied proposal leaves the queue on the next render, because its
  // source stops qualifying. The receipt has to outlive the item, or the
  // athlete's only evidence that anything happened is a card vanishing.
  const [receipts, setReceipts] = useState<Receipt[]>([])

  const apply = (item: QueueItem) => {
    const result = onApply(item) ?? {}
    setReceipts(rs => [{ id: item.id, title: item.title, undo: result.undo }, ...rs])
  }

  const undo = (receipt: Receipt) => {
    receipt.undo?.()
    setReceipts(rs => rs.filter(r => r !== receipt))
  }

  const receiptList = receipts.length > 0 && (
    <div className="space-y-2" data-testid="queue-receipts">
      {receipts.map((r, i) => (
        <div
          key={`${r.id}-${i}`}
          className="bg-teal-50 dark:bg-teal-950 rounded-xl px-4 py-3 border border-teal-200 dark:border-teal-900 flex items-center justify-between gap-3"
          data-testid={`queue-receipt-${r.id}`}
        >
          <p className="text-xs text-teal-900 dark:text-teal-100 leading-relaxed">
            <span className="font-bold">Applied.</span> {r.title}
            {!r.undo && <span className="block opacity-80">This one cannot be taken back.</span>}
          </p>
          {r.undo && (
            <button
              onClick={() => undo(r)}
              className="h-8 px-3 shrink-0 rounded-lg border border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs font-bold"
              data-testid={`queue-undo-${r.id}`}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )

  if (queue.length === 0) {
    return (
      <div className="space-y-2">
      {receiptList}
      <div
        className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700"
        data-testid="review-queue"
      >
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nothing waiting on you</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          New proposals arrive at your evening close, never in the middle of your morning.
        </p>
      </div>
      </div>
    )
  }

  return (
    <div className="space-y-2" data-testid="review-queue">
      {receiptList}
      {queue.map(view => (
        <div
          key={view.id}
          className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700"
          data-testid={`queue-item-${view.id}`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-slate-800 dark:text-white">{view.title}</p>
            <span
              className={`text-[10px] shrink-0 ${view.stale ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}
              data-testid={`queue-age-${view.id}`}
            >
              {waitingLabel(view)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{view.consequence}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => apply(view)}
              className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold"
              data-testid={`queue-apply-${view.id}`}
            >
              Sounds right
            </button>
            <button
              onClick={() => onSnooze(view)}
              className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold"
              data-testid={`queue-snooze-${view.id}`}
            >
              Snooze 30 days
            </button>
          </div>
          <p className="mt-2.5 text-[10px] text-slate-400 leading-snug">
            Expires on its own in a fortnight, with a note in your log — an unanswered
            proposal should not follow you around forever.
          </p>
        </div>
      ))}
      {overflow > 0 && (
        <p className="text-[11px] text-slate-400 px-1" data-testid="queue-overflow">
          {overflow} more waiting — they&rsquo;ll appear as you clear these.
        </p>
      )}
    </div>
  )
}
