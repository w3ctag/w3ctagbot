import { Temporal } from "@js-temporal/polyfill";

/** Maps Saturday and Sunday to Monday of the next week, and the other days to the Monday that
 * starts their week. */
export function closestMonday(from: Temporal.PlainDate): Temporal.PlainDate {
  return from.subtract({ days: ((from.dayOfWeek + 1) % 7) - 2 });
}

export function toPlainDateUTC(from: Date): Temporal.PlainDate {
  return new Temporal.PlainDate(
    from.getUTCFullYear(),
    from.getUTCMonth() + 1,
    from.getUTCDate(),
  );
}
