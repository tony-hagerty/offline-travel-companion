import { useEffect, useRef, useState } from 'react';
import { daysBetween, parseISODate, toISODate, todayISO } from '../lib/dates';
import { Icon } from './Icon';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Every cell of a month grid: leading blanks (null) then YYYY-MM-DD dates. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(toISODate(new Date(year, month, d)));
  return cells;
}

/**
 * Applies a tap to a start/end selection: the first tap (or a tap before the start) picks the
 * start, the next tap picks the end.
 */
export function pickDay(start: string | undefined, end: string | undefined, day: string): { start: string; end?: string } {
  if (!start || end || day < start) return { start: day };
  return { start, end: day };
}

function rangeLabel(start?: string, end?: string): string {
  if (!start) return 'Tap the first day';
  const fmt = (iso: string) => parseISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (!end) return `${fmt(start)} – tap the last day`;
  const days = daysBetween(start, end) + 1;
  return `${fmt(start)} – ${fmt(end)} · ${days} day${days === 1 ? '' : 's'}`;
}

/** A calendar popup for choosing the first and last day of a trip in one place. */
export function DateRangeSheet({
  start,
  end,
  onDone,
  onClose,
}: {
  start: string;
  end: string;
  onDone: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const today = todayISO();
  const [draft, setDraft] = useState<{ start?: string; end?: string }>({ start, end });
  const initial = parseISODate(start || today);
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  // Escape closes; the page behind doesn't scroll while the popup is open.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);

  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const title = new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet calendar-sheet" role="dialog" aria-modal="true" aria-label="Choose trip dates" onClick={(e) => e.stopPropagation()}>
        <div className="calendar-head">
          <strong>Trip dates</strong>
          <span className="muted" aria-live="polite">{rangeLabel(draft.start, draft.end)}</span>
        </div>

        <div className="calendar-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">
            <Icon name="back" />
          </button>
          <span>{title}</span>
          <button className="icon-btn flip" onClick={() => shift(1)} aria-label="Next month">
            <Icon name="back" />
          </button>
        </div>

        <div className="calendar-grid" role="grid">
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="calendar-weekday" aria-hidden="true">{d}</span>
          ))}
          {monthGrid(view.year, view.month).map((iso, i) => {
            if (!iso) return <span key={i} />;
            const isStart = iso === draft.start;
            const isEnd = iso === draft.end;
            const inRange = !!draft.start && !!draft.end && iso > draft.start && iso < draft.end;
            const cls = [
              'calendar-day',
              inRange && 'in-range',
              (isStart || isEnd) && 'selected',
              isStart && draft.end && draft.end !== iso && 'range-start',
              isEnd && draft.start !== iso && 'range-end',
              iso === today && 'today',
              iso < today && 'past',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={iso}
                className={cls}
                aria-pressed={isStart || isEnd || inRange}
                aria-label={parseISODate(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                onClick={() => setDraft(pickDay(draft.start, draft.end, iso))}
              >
                {Number(iso.slice(8))}
              </button>
            );
          })}
        </div>

        <div className="calendar-actions">
          <button className="link-btn" onClick={() => onDone(today, today)}>Just today</button>
          <span className="spacer" />
          <button className="link-btn muted-btn" onClick={onClose}>Cancel</button>
          <button
            className="primary-btn small"
            disabled={!draft.start}
            onClick={() => draft.start && onDone(draft.start, draft.end ?? draft.start)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
