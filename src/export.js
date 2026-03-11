(function() {
  'use strict';

  /* global XLSX */

  const COLUMN_WIDTHS = {
    linkedin_job_id: 16, company: 22, title: 36, location: 22, remote: 12,
    job_type: 14, salary_range: 18, description: 60,
    date_saved: 13, date_applied: 13, deadline: 13,
    url: 38, linkedin_link: 44, notes: 30,
  };

  function buildWorkbook(rows, columns) {
    const headerRow = columns.reduce((obj, col) => { obj[col] = col; return obj; }, {});
    const allRows = [headerRow, ...rows];
    const ws = XLSX.utils.json_to_sheet(allRows, { header: columns, skipHeader: true });

    // Column widths
    ws['!cols'] = columns.map((col) => ({ wch: COLUMN_WIDTHS[col] || 16 }));

    // Autofilter across all columns
    const lastCol = XLSX.utils.encode_col(columns.length - 1);
    const lastRow = allRows.length;
    ws['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jobs');
    return wb;
  }

  async function writeToHandle(handle, rows, columns) {
    const wb = buildWorkbook(rows, columns);
    // type: 'array' returns Uint8Array (browser equivalent of spec's 'buffer')
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const writable = await handle.createWritable();
    await writable.write(buffer);
    await writable.close();
  }

  function exportJobs(rows, columns) {
    const wb = buildWorkbook(rows, columns);
    // type: 'array' returns Uint8Array (browser equivalent of spec's 'buffer')
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `linkedin-jobs-${new Date().toLocaleDateString('en-CA')}.xlsx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.LinkedInCollectorExport = {
    buildWorkbook,
    writeToHandle,
    exportJobs,
  };
})();
