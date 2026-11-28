/**
 * Custom in-website editorial Calendar and Date/Time picker for Elara Atelier.
 * Replaces inconsistent OS browser date popups with a smooth Motion-animated
 * cream & espresso popover unified with GlideSelect.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CLINIC_CONFIG } from '../../config/clinicConfig';
import {
  buildCalendarMonthGrid,
  formatPreferredDateTime,
  getTodayIsoDate,
  isPastCalendarDate,
  isStudioWeekday,
  resolveNextOpenStudioIsoDate,
} from '../../utils/booking';
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
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayIso = getTodayIsoDate(now);
  const effectiveMinYear = mode === 'datetime' ? Math.max(minYear, currentYear) : minYear;
  const effectiveMaxYear = maxYear ?? (mode === 'date' ? currentYear : currentYear + 2);
  const fallbackYear = defaultOpenYear ?? (mode === 'date' ? 1995 : currentYear);

  const parsed = useMemo(() => parsePickerValue(value, fallbackYear), [value, fallbackYear]);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [popoverStyle, setPopoverStyle] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
  }>({ left: 12, top: 100, width: 330, maxHeight: 440 });
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    if (
      mode === 'datetime' &&
      (parsed.year < currentYear ||
        (parsed.year === currentYear && parsed.monthIndex < currentMonth))
    ) {
      return { year: currentYear, month: currentMonth };
    }
    return { year: parsed.year, month: parsed.monthIndex };
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Keep calendar cursor synced when an external value (e.g. profile pre-fill) changes
  useEffect(() => {
    if (parsed.isoDate) {
      if (
        mode === 'datetime' &&
        (parsed.year < currentYear ||
          (parsed.year === currentYear && parsed.monthIndex < currentMonth))
      ) {
        setCursor({ year: currentYear, month: currentMonth });
        return;
      }
      setCursor({ year: parsed.year, month: parsed.monthIndex });
    }
  }, [parsed.isoDate, parsed.year, parsed.monthIndex, mode, currentYear, currentMonth]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    /**
     * Compute fixed viewport coordinates for the portaled calendar popover so it never clips
     * inside modal overflow containers or overflows past screen edges.
     * Inputs: none (reads rootRef bounding rect and window viewport dimensions).
     * Output: void.
     * Errors: None.
     */
    const updatePosition = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const viewportMargin = 12;
      const gap = 6;
      const popWidth = Math.min(330, Math.max(260, window.innerWidth - viewportMargin * 2));
      const needed = mode === 'datetime' ? 405 : 330;

      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportMargin - gap);
      const spaceAbove = Math.max(0, rect.top - viewportMargin - gap);

      const shouldFlipTop =
        spaceBelow < needed && (spaceAbove >= needed || spaceAbove > spaceBelow);
      const nextPlacement: 'bottom' | 'top' = shouldFlipTop ? 'top' : 'bottom';
      const availableHeight = nextPlacement === 'top' ? spaceAbove : spaceBelow;

      // Align with left edge of trigger, clamped safely inside viewport margins
      const clampedLeft = Math.max(
        viewportMargin,
        Math.min(rect.left, window.innerWidth - popWidth - viewportMargin)
      );

      setPlacement(nextPlacement);
      setPopoverStyle({
        left: Math.round(clampedLeft),
        top: nextPlacement === 'bottom' ? Math.round(rect.bottom + gap) : undefined,
        bottom:
          nextPlacement === 'top' ? Math.round(window.innerHeight - rect.top + gap) : undefined,
        width: Math.round(popWidth),
        maxHeight: Math.max(240, Math.floor(availableHeight)),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition, { passive: true });
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, { capture: true });
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const insideTrigger = Boolean(rootRef.current && rootRef.current.contains(target));
      const insidePopover = Boolean(popoverRef.current && popoverRef.current.contains(target));
      if (!insideTrigger && !insidePopover) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const yearOptions: GlideSelectOption[] = useMemo(() => {
    const years: GlideSelectOption[] = [];
    for (let y = effectiveMaxYear; y >= effectiveMinYear; y -= 1) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [effectiveMinYear, effectiveMaxYear]);

  const monthOptions: GlideSelectOption[] = useMemo(() => {
    if (mode === 'datetime' && cursor.year === currentYear) {
      return MONTH_OPTIONS.filter(opt => Number(opt.value) >= currentMonth);
    }
    return MONTH_OPTIONS;
  }, [mode, cursor.year, currentYear, currentMonth]);

  const isAtMinMonth =
    mode === 'datetime' &&
    (cursor.year < currentYear || (cursor.year === currentYear && cursor.month <= currentMonth));

  const grid = useMemo(
    () => buildCalendarMonthGrid(cursor.year, cursor.month),
    [cursor.year, cursor.month]
  );

  /**
   * Move the calendar month forward or backward by delta months.
   * Prevents navigating before the current month in booking datetime mode.
   * Inputs: delta (-1 or +1).
   * Output: void.
   * Errors: None.
   */
  const shiftMonth = (delta: number) => {
    setCursor(prev => {
      const next = new Date(prev.year, prev.month + delta, 1);
      if (
        mode === 'datetime' &&
        (next.getFullYear() < currentYear ||
          (next.getFullYear() === currentYear && next.getMonth() < currentMonth))
      ) {
        return { year: currentYear, month: currentMonth };
      }
      const boundedYear = Math.min(effectiveMaxYear, Math.max(effectiveMinYear, next.getFullYear()));
      return { year: boundedYear, month: next.getMonth() };
    });
  };

  /**
   * Handle picking a date cell inside the calendar grid.
   * Inputs: isoDate string (YYYY-MM-DD), disabled flag for closed Sat/Sun or past dates in booking mode.
   * Output: void.
   * Errors: None.
   */
  const handleSelectDay = (isoDate: string, isDisabledDay: boolean) => {
    if (isDisabledDay) return;
    if (mode === 'date') {
      onChange(isoDate);
      setOpen(false);
      return;
    }
    const time = parsed.timePart || '11:00';
    onChange(`${isoDate}T${time}`);
  };

  /**
   * Handle clicking a clinic time slot in datetime mode, ensuring date lands on today or an upcoming Mon–Fri.
   * Inputs: HH:mm string.
   * Output: void.
   * Errors: None.
   */
  const handleSelectTime = (timeSlot: string) => {
    const candidateIso =
      parsed.isoDate &&
      isStudioWeekday(parsed.isoDate) &&
      !isPastCalendarDate(parsed.isoDate)
        ? parsed.isoDate
        : '';
    const safeIso = resolveNextOpenStudioIsoDate(candidateIso, cursor.year, cursor.month);
    onChange(`${safeIso}T${timeSlot}`);
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

      {typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  ref={popoverRef}
                  initial={{ opacity: 0, scale: 0.96, y: placement === 'bottom' ? -6 : 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: placement === 'bottom' ? -4 : 4 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="fixed z-[80] overflow-x-hidden overflow-y-auto rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-3.5 text-[#1F1B18] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [box-shadow:0_12px_32px_color-mix(in_srgb,#1F1B18_14%,transparent)]"
                  style={{
                    left: `${popoverStyle.left}px`,
                    top: popoverStyle.top !== undefined ? `${popoverStyle.top}px` : undefined,
                    bottom:
                      popoverStyle.bottom !== undefined ? `${popoverStyle.bottom}px` : undefined,
                    width: `${popoverStyle.width}px`,
                    maxHeight: `${popoverStyle.maxHeight}px`,
                  }}
                  role="dialog"
                  aria-label="Interactive clinic calendar"
                >
            {/* Header: Month & Year selectors via GlideSelect */}
            <div className="flex items-center justify-between gap-1.5 border-b border-[#E2D9CE] pb-2.5">
              <button
                type="button"
                disabled={isAtMinMonth}
                onClick={() => shiftMonth(-1)}
                aria-label="Previous calendar month"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#EFE9E0] text-[#1F1B18] transition-colors ${
                  isAtMinMonth
                    ? 'cursor-not-allowed opacity-35'
                    : 'cursor-pointer hover:border-[#B68D5E]'
                }`}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                <GlideSelect
                  options={monthOptions}
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
                  onChange={val => {
                    const nextYear = Number(val);
                    setCursor(prev => ({
                      year: nextYear,
                      month:
                        mode === 'datetime' && nextYear === currentYear
                          ? Math.max(prev.month, currentMonth)
                          : prev.month,
                    }));
                  }}
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
              {WEEKDAYS.map((day, idx) => {
                const isClosedHeader = mode === 'datetime' && (idx === 0 || idx === 6);
                return (
                  <div
                    key={day}
                    title={isClosedHeader ? 'Closed Sat & Sun' : undefined}
                    className={`py-1 ${isClosedHeader ? 'text-[#6E655F]/40 line-through' : ''}`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map(cell => {
                const isWeekend = cell.dayOfWeek === 0 || cell.dayOfWeek === 6;
                const isPastDay = mode === 'datetime' && cell.isoDate < todayIso;
                const isDisabledDay = mode === 'datetime' && (isWeekend || isPastDay);
                const disabledReason = isPastDay
                  ? 'Past dates cannot be booked'
                  : 'Studio closed Saturday & Sunday';
                const disabledAria = isPastDay ? ' (Past date)' : ' (Closed)';
                const isSelected = parsed.isoDate === cell.isoDate && !isDisabledDay;
                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    disabled={isDisabledDay}
                    aria-label={`${cell.isoDate}${isDisabledDay ? disabledAria : ''}`}
                    title={isDisabledDay ? disabledReason : undefined}
                    onClick={() => handleSelectDay(cell.isoDate, isDisabledDay)}
                    className={`flex h-8 w-full items-center justify-center rounded-lg text-xs tabular-nums transition-colors ${
                      isDisabledDay
                        ? 'cursor-not-allowed bg-[#EFE9E0]/35 text-[#6E655F]/30 line-through'
                        : isSelected
                          ? 'cursor-pointer bg-[#1F1B18] font-semibold text-[#FAF7F2]'
                          : cell.isToday
                            ? 'cursor-pointer border border-[#B68D5E] bg-[#EFE9E0] font-semibold text-[#1F1B18]'
                            : cell.inCurrentMonth
                              ? 'cursor-pointer text-[#1F1B18] hover:bg-[#EFE9E0]'
                              : 'cursor-pointer text-[#6E655F]/45 hover:bg-[#EFE9E0]/50'
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
                  <span>{CLINIC_CONFIG.hoursShort}</span>
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
            </AnimatePresence>,
            document.body
          )
        : null}
    </div>
  );
};

export default AtelierDatePicker;
