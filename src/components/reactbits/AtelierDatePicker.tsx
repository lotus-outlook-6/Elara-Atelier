/**
 * Custom in-website editorial Calendar and Date/Time picker for Elara Atelier.
 * Replaces inconsistent OS browser date popups with a smooth Motion-animated
 * cream & espresso popover unified with GlideSelect.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { buildCalendarMonthGrid, formatPreferredDateTime } from '../../utils/booking';
import GlideSelect, { type GlideSelectOption } from './GlideSelect';

export interface AtelierDatePickerProps {
  id?: string;
  mode: 'date' | 'datetime';
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  minYear?: number;
  maxYear?: number;
  defaultOpenYear?: number;
  surfaceColor?: string;
  className?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const MONTH_OPTIONS: GlideSelectOption[] = [
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
];

const CLINIC_TIME_SLOTS: { value: string; label: string }[] = [
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:30', label: '12:30 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:30', label: '3:30 PM' },
  { value: '17:00', label: '5:00 PM' },
];

/**
 * Parse a YYYY-MM-DD or YYYY-MM-DDTHH:mm string into safe calendar parts.
 * Inputs: raw string and fallback year.
 * Output: { isoDate, timePart, year, monthIndex }.
 */
function parsePickerValue(raw: string, fallbackYear: number) {
  const [dateSegment = '', timeSegment = '11:00'] = raw.split('T');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateSegment.trim());
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Math.min(11, Math.max(0, Number(match[2]) - 1));
    return {
      isoDate: `${match[1]}-${match[2]}-${match[3]}`,
      timePart: /^\d{2}:\d{2}$/.test(timeSegment) ? timeSegment : '11:00',
      year,
      monthIndex,
    };
  }
  const now = new Date();
  return {
    isoDate: '',
    timePart: '11:00',
    year: fallbackYear || now.getFullYear(),
    monthIndex: fallbackYear ? 0 : now.getMonth(),
  };
}

/**
 * Format YYYY-MM-DD into a calm readable label while keeping direct typing accurate.
 * Inputs: isoDate string.
 * Output: readable date string or placeholder.
 */
function formatIsoDateDisplay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Smooth in-website Calendar & Time popover matching GlideSelect aesthetics.
 */
export const AtelierDatePicker: React.FC<AtelierDatePickerProps> = ({
  id,
  mode,
  value,
  onChange,
  placeholder,
  ariaLabel,
  ariaInvalid = false,
  minYear = 1925,
  maxYear,
  defaultOpenYear,
  surfaceColor = '#FAF7F2',
  className = '',
}) => {
  const currentYear = new Date().getFullYear();
  const effectiveMaxYear = maxYear ?? (mode === 'date' ? currentYear : currentYear + 2);
  const fallbackYear = defaultOpenYear ?? (mode === 'date' ? 1995 : currentYear);

  const parsed = useMemo(() => parsePickerValue(value, fallbackYear), [value, fallbackYear]);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [cursor, setCursor] = useState<{ year: number; month: number }>({
    year: parsed.year,
    month: parsed.monthIndex,
  });

  const rootRef = useRef<HTMLDivElement>(null);

  // Keep calendar cursor synced when an external value (e.g. profile pre-fill) changes
  useEffect(() => {
    if (parsed.isoDate) {
      setCursor({ year: parsed.year, month: parsed.monthIndex });
    }
  }, [parsed.isoDate, parsed.year, parsed.monthIndex]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const needed = mode === 'datetime' ? 390 : 320;
    setPlacement(spaceBelow < needed && rect.top > needed ? 'top' : 'bottom');
  }, [open, mode]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const yearOptions: GlideSelectOption[] = useMemo(() => {
    const years: GlideSelectOption[] = [];
    for (let y = effectiveMaxYear; y >= minYear; y -= 1) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [minYear, effectiveMaxYear]);

  const grid = useMemo(
    () => buildCalendarMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  );

  /**
   * Move the calendar month forward or backward by delta months.
   * Inputs: delta (-1 or +1).
   */
  const shiftMonth = (delta: number) => {
    setCursor(prev => {
      const next = new Date(prev.year, prev.month + delta, 1);
      const boundedYear = Math.min(effectiveMaxYear, Math.max(minYear, next.getFullYear()));
      return { year: boundedYear, month: next.getMonth() };
    });
  };

  /**
   * Handle picking a date cell inside the calendar grid.
   * Inputs: isoDate string (YYYY-MM-DD).
   */
  const handleSelectDay = (isoDate: string) => {
    if (mode === 'date') {
      onChange(isoDate);
      setOpen(false);
      return;
    }
    const time = parsed.timePart || '11:00';
    onChange(`${isoDate}T${time}`);
  };

  /**
   * Handle clicking a clinic time slot in datetime mode.
   * Inputs: HH:mm string.
   */
  const handleSelectTime = (timeSlot: string) => {
    const fallbackIso =
      parsed.isoDate ||
      `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
    onChange(`${fallbackIso}T${timeSlot}`);
    setOpen(false);
  };

  const displayDateTime = value
    ? formatPreferredDateTime(value)
    : placeholder || 'Select date & time';

  return (
    <div ref={rootRef} className={`relative w-full ${className}`.trim()}>
      {mode === 'date' ? (
        <div
          className="flex h-11 w-full items-center rounded-[10px] border border-[#E2D9CE] transition-colors focus-within:border-[#B68D5E]"
          style={{ backgroundColor: surfaceColor }}
        >
          <input
            id={id}
            type="text"
            inputMode="numeric"
            aria-label={ariaLabel || 'Date (YYYY-MM-DD)'}
            aria-invalid={ariaInvalid}
            placeholder={placeholder || 'YYYY-MM-DD'}
            value={value}
            onFocus={() => setOpen(true)}
            onChange={e => onChange(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-sm text-[#1F1B18] placeholder-[#6E655F]/60 tabular-nums outline-none"
          />
          {value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? (
            <span className="hidden pr-1 text-[11px] font-medium text-[#6E655F] sm:inline">
              {formatIsoDateDisplay(value)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(prev => !prev)}
            aria-label="Toggle in-website calendar"
            aria-expanded={open}
            className="inline-flex h-full shrink-0 cursor-pointer items-center justify-center rounded-r-[9px] px-3 text-[#6E655F] transition-colors hover:text-[#1F1B18]"
          >
            <CalendarIcon className="h-4 w-4 text-[#B68D5E]" />
          </button>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          onClick={() => setOpen(prev => !prev)}
          aria-label={ariaLabel || 'Choose preferred date and time'}
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          className="flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-[#E2D9CE] px-3.5 text-left text-sm text-[#1F1B18] tabular-nums transition-colors hover:border-[#B68D5E] focus:border-[#B68D5E] focus:outline-none"
          style={{ backgroundColor: surfaceColor }}
        >
          <span className="truncate font-medium">{displayDateTime}</span>
          <CalendarIcon className="h-4 w-4 shrink-0 text-[#B68D5E]" />
        </button>
      )}

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: placement === 'bottom' ? -6 : 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: placement === 'bottom' ? -4 : 4 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className={`absolute left-0 z-50 w-[min(330px,calc(100vw-2.5rem))] rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-3.5 text-[#1F1B18] [box-shadow:0_12px_32px_color-mix(in_srgb,#1F1B18_14%,transparent)] ${
              placement === 'bottom' ? 'top-[calc(100%+6px)]' : 'bottom-[calc(100%+6px)]'
            }`}
            role="dialog"
            aria-label="Interactive clinic calendar"
          >
            {/* Header: Month & Year selectors via GlideSelect */}
            <div className="flex items-center justify-between gap-1.5 border-b border-[#E2D9CE] pb-2.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous calendar month"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#EFE9E0] text-[#1F1B18] transition-colors hover:border-[#B68D5E]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                <GlideSelect
                  options={MONTH_OPTIONS}
                  value={String(cursor.month)}
                  onChange={val => setCursor(prev => ({ ...prev, month: Number(val) }))}
                  showTags={false}
                  size="sm"
                  radius={8}
                  menuWidth={132}
                  surfaceColor="#EFE9E0"
                  highlightColor="#E5DACB"
                  accentColor="#B68D5E"
                  textColor="#1F1B18"
                  ariaLabel="Calendar month"
                  className="flex-1"
                />
                <GlideSelect
                  options={yearOptions}
                  value={String(cursor.year)}
                  onChange={val => setCursor(prev => ({ ...prev, year: Number(val) }))}
                  showTags={false}
                  size="sm"
                  radius={8}
                  menuWidth={96}
                  align="right"
                  surfaceColor="#EFE9E0"
                  highlightColor="#E5DACB"
                  accentColor="#B68D5E"
                  textColor="#1F1B18"
                  ariaLabel="Calendar year"
                  className="w-[82px] shrink-0"
                />
              </div>

              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next calendar month"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#EFE9E0] text-[#1F1B18] transition-colors hover:border-[#B68D5E]"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Weekday Header */}
            <div className="mt-2.5 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-[0.1em] text-[#6E655F] uppercase">
              {WEEKDAYS.map(day => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map(cell => {
                const isSelected = parsed.isoDate === cell.isoDate;
                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    onClick={() => handleSelectDay(cell.isoDate)}
                    className={`flex h-8 w-full cursor-pointer items-center justify-center rounded-lg text-xs tabular-nums transition-colors ${
                      isSelected
                        ? 'bg-[#1F1B18] font-semibold text-[#FAF7F2]'
                        : cell.isToday
                          ? 'border border-[#B68D5E] bg-[#EFE9E0] font-semibold text-[#1F1B18]'
                          : cell.inCurrentMonth
                            ? 'text-[#1F1B18] hover:bg-[#EFE9E0]'
                            : 'text-[#6E655F]/45 hover:bg-[#EFE9E0]/50'
                    }`}
                  >
                    {cell.dayNumber}
                  </button>
                );
              })}
            </div>

            {/* Studio Time Slot Selector for Booking Datetime Mode */}
            {mode === 'datetime' ? (
              <div className="mt-3 border-t border-[#E2D9CE] pt-3">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold tracking-[0.1em] text-[#6E655F] uppercase">
                  <span className="inline-flex items-center gap-1 text-[#1F1B18]">
                    <Clock className="h-3 w-3 text-[#B68D5E]" />
                    Studio Hours
                  </span>
                  <span>Mon–Sat · 10 AM – 7 PM</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CLINIC_TIME_SLOTS.map(slot => {
                    const active = parsed.timePart === slot.value;
                    return (
                      <button
                        key={slot.value}
                        type="button"
                        onClick={() => handleSelectTime(slot.value)}
                        className={`cursor-pointer rounded-lg border py-1.5 text-[11px] font-medium tabular-nums transition-colors ${
                          active
                            ? 'border-[#1F1B18] bg-[#1F1B18] text-[#FAF7F2]'
                            : 'border-[#E2D9CE] bg-[#EFE9E0]/70 text-[#1F1B18] hover:border-[#B68D5E] hover:bg-[#E5DACB]'
                        }`}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default AtelierDatePicker;
