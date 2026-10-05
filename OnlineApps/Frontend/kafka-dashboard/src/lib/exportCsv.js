const HEADERS = [
  'timestamp', 'case_id', 'deviation_type', 'type',
  'severity', 'cumulative_score', 'message', 'event_history',
];

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toRow(alert) {
  return [
    alert.timestamp,
    alert.case_id,
    alert.deviation_type,
    alert.type,
    alert.severity ?? '',
    typeof alert.cumulative_score === 'number' ? alert.cumulative_score.toFixed(4) : '0',
    alert.message,
    alert.event_history?.join(' | ') ?? '',
  ].map(escapeCsv).join(',');
}

export function exportAlertsToCsv(alerts) {
  const csv = [HEADERS.join(','), ...alerts.map(toRow)].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `gotr-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();

  // Release the blob once the download has been triggered.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
