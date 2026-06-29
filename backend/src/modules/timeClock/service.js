const { query } = require('../../database/pool');

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function summarizeClockRecords(records) {
  const grouped = new Map();

  for (const record of records) {
    const key = `${record.employee_id}-${dateKey(record.occurred_at)}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        employeeId: record.employee_id,
        employeeName: record.employee_name,
        date: dateKey(record.occurred_at),
        records: [],
        totalMs: 0,
        open: false
      });
    }

    grouped.get(key).records.push(record);
  }

  return Array.from(grouped.values()).map((day) => {
    let entryTime = null;
    let intervalStart = null;
    let pauseMs = 0;
    let totalMs = 0;

    for (const record of day.records) {
      const occurredAt = new Date(record.occurred_at).getTime();

      if (record.event_type === 'entrada') {
        entryTime = occurredAt;
        intervalStart = null;
        pauseMs = 0;
      }

      if (record.event_type === 'inicio_intervalo' && entryTime && !intervalStart) {
        intervalStart = occurredAt;
      }

      if (record.event_type === 'fim_intervalo' && intervalStart) {
        pauseMs += occurredAt - intervalStart;
        intervalStart = null;
      }

      if (record.event_type === 'saida' && entryTime) {
        totalMs += occurredAt - entryTime - pauseMs;
        entryTime = null;
        intervalStart = null;
        pauseMs = 0;
      }
    }

    day.totalMs = totalMs;
    day.totalHours = Number((totalMs / 1000 / 60 / 60).toFixed(2));
    day.open = Boolean(entryTime);

    return day;
  });
}

async function getTimeClockReport({ from, to, employeeId } = {}) {
  const params = [];
  const where = [];

  if (from) {
    params.push(from);
    where.push(`tcr.occurred_at >= $${params.length}`);
  }

  if (to) {
    params.push(to);
    where.push(`tcr.occurred_at <= $${params.length}`);
  }

  if (employeeId) {
    params.push(employeeId);
    where.push(`tcr.employee_id = $${params.length}`);
  }

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await query(
    `SELECT tcr.id, tcr.employee_id, e.name AS employee_name, tcr.event_type, tcr.occurred_at, tcr.notes
     FROM time_clock_records tcr
     JOIN employees e ON e.id = tcr.employee_id
     ${sqlWhere}
     ORDER BY tcr.employee_id, tcr.occurred_at`,
    params
  );

  return summarizeClockRecords(result.rows);
}

module.exports = {
  getTimeClockReport,
  summarizeClockRecords
};
