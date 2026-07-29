const OutingRequest = require('../models/OutingRequest');
const Complaint = require('../models/Complaint');
const SOSAlert = require('../models/SOSAlert');
const User = require('../models/User');

const ALLOWED_PERIODS = new Set([7, 30, 90]);
const TIMEZONE = '+05:30';
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

const fillDailySeries = (rawSeries, startDate, days) => {
  const counts = new Map((rawSeries || []).map((item) => [item._id, item.count]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate.getTime() + (index * DAY_MS));
    const key = dateKey(date);
    return { date: key, count: counts.get(key) || 0 };
  });
};

const statusCount = (rows, status) => rows.find((row) => row._id === status)?.count || 0;

// GET /api/admin/analytics?days=7|30|90 — private (Admin)
// Outing frequency intentionally counts passes that were actually started, not
// pending/rejected/unused requests. Legacy rows fall back to their scheduled outTime.
const getAnalytics = async (req, res) => {
  try {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const days = ALLOWED_PERIODS.has(requestedDays) ? requestedDays : 30;
    const now = new Date();
    const startDate = new Date(startOfIstDay(now).getTime() - ((days - 1) * DAY_MS));
    const outingActivityDate = { $ifNull: ['$actualOutTime', '$outTime'] };

    const [outingResult, complaintResult, sosResult] = await Promise.all([
      OutingRequest.aggregate([
        { $match: { status: { $in: ['Out', 'Returned'] } } },
        { $addFields: { analyticsDate: outingActivityDate } },
        { $match: { analyticsDate: { $gte: startDate, $lte: now } } },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  students: { $addToSet: '$student' },
                  overdueReturns: {
                    $sum: { $cond: [{ $eq: ['$returnPunctuality', 'Overdue'] }, 1, 0] },
                  },
                },
              },
            ],
            trend: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$analyticsDate',
                      timezone: TIMEZONE,
                    },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
            topStudents: [
              {
                $group: {
                  _id: '$student',
                  count: { $sum: 1 },
                  overdueReturns: {
                    $sum: { $cond: [{ $eq: ['$returnPunctuality', 'Overdue'] }, 1, 0] },
                  },
                  lastOuting: { $max: '$analyticsDate' },
                },
              },
              { $sort: { count: -1, lastOuting: -1 } },
              { $limit: 10 },
              {
                $lookup: {
                  from: User.collection.name,
                  localField: '_id',
                  foreignField: '_id',
                  as: 'studentProfile',
                },
              },
              { $unwind: { path: '$studentProfile', preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 0,
                  studentId: '$_id',
                  name: { $ifNull: ['$studentProfile.name', 'Unknown student'] },
                  registrationNumber: { $ifNull: ['$studentProfile.studentId', '—'] },
                  hostelName: { $ifNull: ['$studentProfile.hostelName', 'Unassigned'] },
                  department: { $ifNull: ['$studentProfile.department', '—'] },
                  count: 1,
                  overdueReturns: 1,
                  lastOuting: 1,
                },
              },
            ],
            byType: [
              { $group: { _id: { $ifNull: ['$outingType', 'General'] }, count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            byWeekday: [
              {
                $group: {
                  _id: { $dayOfWeek: { date: '$analyticsDate', timezone: TIMEZONE } },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
            byHour: [
              {
                $group: {
                  _id: { $hour: { date: '$analyticsDate', timezone: TIMEZONE } },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
          },
        },
      ]),
      Complaint.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: now } } },
        {
          $facet: {
            trend: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: TIMEZONE,
                    },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            byCategoryAndStatus: [
              { $group: { _id: { category: '$category', status: '$status' }, count: { $sum: 1 } } },
            ],
            resolution: [
              { $match: { status: 'Resolved' } },
              {
                $group: {
                  _id: null,
                  averageMs: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } },
                },
              },
            ],
          },
        },
      ]),
      SOSAlert.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: now } } },
        {
          $facet: {
            trend: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: TIMEZONE,
                    },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            byType: [
              { $group: { _id: '$type', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            handling: [
              { $match: { status: { $ne: 'Active' } } },
              {
                $group: {
                  _id: null,
                  averageMs: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const outingsRaw = outingResult[0] || {};
    const outingSummary = outingsRaw.summary?.[0] || { total: 0, students: [], overdueReturns: 0 };
    const uniqueStudents = outingSummary.students?.length || 0;
    const topStudents = (outingsRaw.topStudents || []).map((student) => ({
      ...student,
      outingsPerWeek: round(student.count / (days / 7)),
    }));

    const complaintRaw = complaintResult[0] || {};
    const complaintStatuses = complaintRaw.byStatus || [];
    const complaintTotal = complaintStatuses.reduce((sum, row) => sum + row.count, 0);
    const complaintResolved = statusCount(complaintStatuses, 'Resolved');
    const complaintCategories = new Map();
    for (const row of complaintRaw.byCategoryAndStatus || []) {
      const { category, status } = row._id;
      const current = complaintCategories.get(category) || {
        category,
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        rejected: 0,
      };
      current.total += row.count;
      if (status === 'Open') current.open += row.count;
      if (status === 'In Progress') current.inProgress += row.count;
      if (status === 'Resolved') current.resolved += row.count;
      if (status === 'Rejected') current.rejected += row.count;
      complaintCategories.set(category, current);
    }

    const sosRaw = sosResult[0] || {};
    const sosStatuses = sosRaw.byStatus || [];
    const sosTotal = sosStatuses.reduce((sum, row) => sum + row.count, 0);

    res.json({
      period: {
        days,
        start: startDate,
        end: now,
        timezone: 'Asia/Kolkata',
        generatedAt: now,
      },
      outings: {
        total: outingSummary.total || 0,
        uniqueStudents,
        averagePerStudent: uniqueStudents ? round(outingSummary.total / uniqueStudents) : 0,
        averagePerDay: round((outingSummary.total || 0) / days),
        overdueReturns: outingSummary.overdueReturns || 0,
        overdueRate: outingSummary.total ? round((outingSummary.overdueReturns / outingSummary.total) * 100) : 0,
        trend: fillDailySeries(outingsRaw.trend, startDate, days),
        topStudents,
        byType: (outingsRaw.byType || []).map((row) => ({ type: row._id, count: row.count })),
        byWeekday: (outingsRaw.byWeekday || []).map((row) => ({ day: row._id, count: row.count })),
        byHour: (outingsRaw.byHour || []).map((row) => ({ hour: row._id, count: row.count })),
      },
      complaints: {
        total: complaintTotal,
        open: statusCount(complaintStatuses, 'Open'),
        inProgress: statusCount(complaintStatuses, 'In Progress'),
        resolved: complaintResolved,
        rejected: statusCount(complaintStatuses, 'Rejected'),
        resolutionRate: complaintTotal ? round((complaintResolved / complaintTotal) * 100) : 0,
        averageResolutionHours: round((complaintRaw.resolution?.[0]?.averageMs || 0) / (60 * 60 * 1000)),
        trend: fillDailySeries(complaintRaw.trend, startDate, days),
        byCategory: Array.from(complaintCategories.values()).sort((a, b) => b.total - a.total),
      },
      sos: {
        total: sosTotal,
        active: statusCount(sosStatuses, 'Active'),
        acknowledged: statusCount(sosStatuses, 'Acknowledged'),
        resolved: statusCount(sosStatuses, 'Resolved'),
        averageHandlingMinutes: round((sosRaw.handling?.[0]?.averageMs || 0) / (60 * 1000)),
        trend: fillDailySeries(sosRaw.trend, startDate, days),
        byType: (sosRaw.byType || []).map((row) => ({ type: row._id, count: row.count })),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getAnalytics };
