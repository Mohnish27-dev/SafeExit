const { QueryTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');

// ---------------------------------------------------------------------------
// The two aggregation pipelines.
//
// These were the only $facet pipelines in the app — one with five branches over
// outing_requests, one with four over sos_alerts, plus a $lookup to attach student
// profiles to the top-ten list. They are raw SQL here rather than Sequelize calls,
// which is exactly what the ORM decision anticipated: aggregation is where Sequelize
// stops helping, and sequelize.query() was chosen to cover it.
//
// Each pipeline is still ONE round trip. A $facet runs its branches over a shared
// pipeline; the CTE plus scalar subqueries below do the same thing — `windowed` is
// computed once and every branch reads it — and json_build_object/json_agg return the
// branches as one row, so the response shape assembles the same way it always did.
//
// Two translation details that would be silent bugs if missed:
//
//  1. WEEKDAY NUMBERING. Mongo's $dayOfWeek is 1=Sunday..7=Saturday. Postgres'
//     EXTRACT(DOW) is 0=Sunday..6=Saturday. The admin dashboard's WEEKDAYS table maps
//     day:1 to "Sun", so without the +1 every bar in the chart would shift by a day and
//     Sunday's count would be dropped on the floor. EXTRACT(HOUR) needs no such fix —
//     both are 0-23.
//
//  2. TIME ZONE. `$dateToString`/`$dayOfWeek`/`$hour` all took timezone: '+05:30'.
//     `<timestamptz> AT TIME ZONE 'Asia/Kolkata'` is the equivalent, and it is better:
//     the named zone follows India's rules rather than hard-coding an offset. It needs
//     no extension — Postgres always ships the tz database.
// ---------------------------------------------------------------------------

const ALLOWED_PERIODS = new Set([7, 30, 90]);
const IST = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const dateKey = (date) => {
  // Shift to IST before taking the ISO date portion.
  return new Date(date.getTime() + (5.5 * 60 * 60 * 1000)).toISOString().slice(0, 10);
};

const startOfIstDay = (date) => new Date(`${dateKey(date)}T00:00:00.000+05:30`);

// The SQL only returns days that have rows; the chart needs every day in the period,
// including the empty ones.
const fillDailySeries = (rawSeries, startDate, days) => {
  const counts = new Map((rawSeries || []).map((item) => [item.date, item.count]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate.getTime() + (index * DAY_MS));
    const key = dateKey(date);
    return { date: key, count: counts.get(key) || 0 };
  });
};

const statusCount = (rows, status) => rows.find((row) => row.status === status)?.count || 0;

// Outing frequency intentionally counts passes that were actually started, not
// pending/rejected/unused requests. Legacy rows fall back to their scheduled outTime,
// which is what COALESCE(actual_out_time, out_time) preserves from the $ifNull.
const OUTING_SQL = `
WITH windowed AS (
  SELECT
    o.student_id,
    o.return_punctuality,
    COALESCE(o.outing_type, 'General') AS outing_type,
    COALESCE(o.actual_out_time, o.out_time) AS analytics_date
  FROM outing_requests o
  WHERE o.status IN ('Out', 'Returned')
    AND COALESCE(o.actual_out_time, o.out_time) >= :startDate
    AND COALESCE(o.actual_out_time, o.out_time) <= :endDate
)
SELECT
  -- $addToSet then .length became count(DISTINCT): Mongo built the whole array of
  -- student ids in memory just to measure it.
  (SELECT json_build_object(
      'total', count(*)::int,
      'uniqueStudents', count(DISTINCT student_id)::int,
      'overdueReturns', (count(*) FILTER (WHERE return_punctuality = 'Overdue'))::int
    ) FROM windowed) AS summary,

  (SELECT COALESCE(json_agg(t ORDER BY t.date), '[]'::json) FROM (
      SELECT to_char(analytics_date AT TIME ZONE '${IST}', 'YYYY-MM-DD') AS date,
             count(*)::int AS count
      FROM windowed GROUP BY 1
    ) t) AS trend,

  -- The $lookup into users is a LEFT JOIN. The COALESCEs are the $ifNull defaults, kept
  -- so a pass whose student was deleted still shows as "Unknown student" rather than
  -- disappearing from the ranking.
  (SELECT COALESCE(json_agg(x ORDER BY x.count DESC, x."lastOuting" DESC), '[]'::json) FROM (
      SELECT
        w.student_id                                  AS "studentId",
        COALESCE(u.name, 'Unknown student')           AS name,
        COALESCE(u.student_id, '—')                   AS "registrationNumber",
        COALESCE(u.hostel_name, 'Unassigned')         AS "hostelName",
        COALESCE(u.department, '—')                   AS department,
        count(*)::int                                 AS count,
        (count(*) FILTER (WHERE w.return_punctuality = 'Overdue'))::int AS "overdueReturns",
        max(w.analytics_date)                         AS "lastOuting"
      FROM windowed w
      LEFT JOIN users u ON u.id = w.student_id
      GROUP BY w.student_id, u.name, u.student_id, u.hostel_name, u.department
      ORDER BY count(*) DESC, max(w.analytics_date) DESC
      LIMIT 10
    ) x) AS "topStudents",

  (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
      SELECT outing_type AS type, count(*)::int AS count
      FROM windowed GROUP BY 1
    ) t) AS "byType",

  -- +1 converts Postgres' 0=Sunday to Mongo's 1=Sunday, which is what the dashboard's
  -- WEEKDAYS table is keyed on.
  (SELECT COALESCE(json_agg(t ORDER BY t.day), '[]'::json) FROM (
      SELECT (EXTRACT(DOW FROM analytics_date AT TIME ZONE '${IST}')::int + 1) AS day,
             count(*)::int AS count
      FROM windowed GROUP BY 1
    ) t) AS "byWeekday",

  (SELECT COALESCE(json_agg(t ORDER BY t.hour), '[]'::json) FROM (
      SELECT EXTRACT(HOUR FROM analytics_date AT TIME ZONE '${IST}')::int AS hour,
             count(*)::int AS count
      FROM windowed GROUP BY 1
    ) t) AS "byHour"
`;

const SOS_SQL = `
WITH windowed AS (
  SELECT status, type, created_at, updated_at
  FROM sos_alerts
  WHERE created_at >= :startDate AND created_at <= :endDate
)
SELECT
  (SELECT COALESCE(json_agg(t ORDER BY t.date), '[]'::json) FROM (
      SELECT to_char(created_at AT TIME ZONE '${IST}', 'YYYY-MM-DD') AS date,
             count(*)::int AS count
      FROM windowed GROUP BY 1
    ) t) AS trend,

  (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
      SELECT status, count(*)::int AS count FROM windowed GROUP BY 1
    ) t) AS "byStatus",

  (SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json) FROM (
      SELECT type, count(*)::int AS count FROM windowed GROUP BY 1
    ) t) AS "byType",

  -- $subtract on two dates yielded milliseconds; EXTRACT(EPOCH) yields seconds, so the
  -- x1000 keeps averageMs meaning what the response field says it means.
  (SELECT avg(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)
     FROM windowed WHERE status <> 'Active') AS "averageMs"
`;

// GET /api/admin/analytics?days=7|30|90 — private (Admin)
const getAnalytics = async (req, res) => {
  try {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const days = ALLOWED_PERIODS.has(requestedDays) ? requestedDays : 30;
    const now = new Date();
    const startDate = new Date(startOfIstDay(now).getTime() - ((days - 1) * DAY_MS));
    const replacements = { startDate, endDate: now };
    const sequelize = getSequelize();

    const [outings, sos] = await Promise.all([
      sequelize.query(OUTING_SQL, { replacements, type: QueryTypes.SELECT, plain: true }),
      sequelize.query(SOS_SQL, { replacements, type: QueryTypes.SELECT, plain: true }),
    ]);

    const summary = outings.summary || { total: 0, uniqueStudents: 0, overdueReturns: 0 };
    const uniqueStudents = summary.uniqueStudents || 0;
    const topStudents = (outings.topStudents || []).map((student) => ({
      ...student,
      outingsPerWeek: round(student.count / (days / 7)),
    }));

    const sosStatuses = sos.byStatus || [];
    const sosTotal = sosStatuses.reduce((sum, row) => sum + row.count, 0);

    res.json({
      period: {
        days,
        start: startDate,
        end: now,
        timezone: IST,
        generatedAt: now,
      },
      outings: {
        total: summary.total || 0,
        uniqueStudents,
        averagePerStudent: uniqueStudents ? round(summary.total / uniqueStudents) : 0,
        averagePerDay: round((summary.total || 0) / days),
        overdueReturns: summary.overdueReturns || 0,
        overdueRate: summary.total ? round((summary.overdueReturns / summary.total) * 100) : 0,
        trend: fillDailySeries(outings.trend, startDate, days),
        topStudents,
        byType: outings.byType || [],
        byWeekday: outings.byWeekday || [],
        byHour: outings.byHour || [],
      },
      sos: {
        total: sosTotal,
        active: statusCount(sosStatuses, 'Active'),
        acknowledged: statusCount(sosStatuses, 'Acknowledged'),
        resolved: statusCount(sosStatuses, 'Resolved'),
        averageHandlingMinutes: round((Number(sos.averageMs) || 0) / (60 * 1000)),
        trend: fillDailySeries(sos.trend, startDate, days),
        byType: sos.byType || [],
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getAnalytics };
