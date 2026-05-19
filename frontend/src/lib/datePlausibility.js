/** Max calendar drift from reference (today / capture) before a date is implausible. */
export const MAX_FORM_DATE_DRIFT_DAYS = 31;

/** Calendar years away from reference year before we always flag (e.g. 2016 vs 2026). */
export const MAX_FORM_DATE_YEAR_GAP = 1;

/**
 * Parse a form date/datetime field value to a local calendar Date (midnight for date-only).
 */
export function parseFormDateValue(value, fieldType) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;

  if (fieldType === "date") {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }

  if (fieldType === "datetime") {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (m) {
      const d = new Date(
        parseInt(m[1], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[3], 10),
        parseInt(m[4], 10),
        parseInt(m[5], 10)
      );
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Returns plausibility info or null if the value is empty / unparseable.
 */
export function getDatePlausibilityIssue(
  value,
  fieldType,
  { referenceDate = new Date(), maxDriftDays = MAX_FORM_DATE_DRIFT_DAYS, maxYearGap = MAX_FORM_DATE_YEAR_GAP } = {}
) {
  const parsed = parseFormDateValue(value, fieldType);
  if (!parsed) return null;

  const ref = startOfLocalDay(referenceDate);
  const target = startOfLocalDay(parsed);
  const daysOff = Math.round((target - ref) / 86400000);
  const yearsOff = Math.abs(target.getFullYear() - ref.getFullYear());

  if (yearsOff > maxYearGap || Math.abs(daysOff) > maxDriftDays) {
    return {
      implausible: true,
      daysOff,
      yearsOff,
      parsedYear: target.getFullYear(),
      referenceYear: ref.getFullYear(),
    };
  }

  return { implausible: false, daysOff, yearsOff };
}

export function isImplausibleFormDate(value, fieldType, options) {
  const issue = getDatePlausibilityIssue(value, fieldType, options);
  return issue?.implausible === true;
}

/** Local YYYY-MM-DD for date inputs. */
export function localTodayIsoDate(referenceDate = new Date()) {
  const d = referenceDate;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local YYYY-MM-DDTHH:MM for datetime-local inputs (keeps time from value when possible). */
export function snapFormDateToToday(value, fieldType, referenceDate = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const ref = referenceDate;
  if (fieldType === "datetime") {
    const parsed = parseFormDateValue(value, fieldType);
    const hh = parsed ? pad(parsed.getHours()) : pad(ref.getHours());
    const mm = parsed ? pad(parsed.getMinutes()) : pad(ref.getMinutes());
    return `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-${pad(ref.getDate())}T${hh}:${mm}`;
  }
  return localTodayIsoDate(ref);
}
