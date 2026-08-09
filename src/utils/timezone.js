'use strict';

/**
 * Offset of `timeZone` at a given instant, in minutes east of UTC.
 * e.g. Africa/Dar_es_Salaam -> +180 at any instant (no DST).
 */
function tzOffsetMinutes(timeZone, at) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
      hour12: false,
    });
    const parts = dtf.formatToParts(at);
    const label = parts.find((p) => p.type === 'timeZoneName');
    const value = label && label.value;
    if (!value) return null;
    const match = value.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!match) return null;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] || 0);
    return sign * (hours * 60 + minutes);
  } catch (_) {
    return null;
  }
}

/**
 * Interpret `localValue` (an ISO-like date WITHOUT timezone info, e.g. "2026-08-10 10:30:00")
 * as a wall-clock time inside `timeZone` and return the equivalent UTC Date.
 * Falls back to treating the value as UTC when the timezone is invalid/unknown.
 */
function localToUtc(localValue, timeZone) {
  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid local datetime');

  const offsetMinutes = tzOffsetMinutes(timeZone, parsed);
  if (offsetMinutes === null) return parsed;

  return new Date(parsed.getTime() - offsetMinutes * 60 * 1000);
}

function isIsoLike(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value));
}

/**
 * Convert a user-supplied date string for `scheduled_at` into a UTC Date:
 * - If the string already carries an explicit offset (e.g. "…Z", "+03:00") it is
 *   used as-is.
 * - Otherwise the string is treated as a wall clock in `timeZone`.
 */
function parseScheduledAt(value, timeZone) {
  const text = String(value).trim();
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new Error('scheduled_at sahihi inahitajika (ISO date)');
  }
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    return new Date(text);
  }
  return localToUtc(text, timeZone);
}

module.exports = { localToUtc, tzOffsetMinutes, isIsoLike, parseScheduledAt };