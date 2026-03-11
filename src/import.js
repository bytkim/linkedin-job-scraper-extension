(function() {
  'use strict';

  /* global XLSX */

  function extractJobIdFromLink(linkedinLink) {
    const match = String(linkedinLink || '').match(/\/jobs\/view\/(\d+)/);
    return match ? match[1] : '';
  }

  function parseWorkbook(arrayBuffer) {
    const jobs = [];
    const errors = [];

    try {
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        errors.push('No sheets found in workbook');
        return { jobs, errors };
      }

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      const columns = window.LinkedInCollectorSchema.EXPORT_COLUMNS;

      for (let i = 0; i < rows.length; i++) {
        try {
          const raw = rows[i];
          const job = {};
          for (const col of columns) {
            job[col] = String(raw[col] ?? '').trim();
          }

          // Ensure linkedin_job_id exists — fall back to extracting from linkedin_link
          if (!job.linkedin_job_id) {
            job.linkedin_job_id = extractJobIdFromLink(job.linkedin_link);
          }

          // Skip rows with no usable ID
          if (!job.linkedin_job_id) {
            errors.push(`Row ${i + 2}: no linkedin_job_id or linkedin_link, skipped`);
            continue;
          }

          jobs.push(job);
        } catch (rowError) {
          errors.push(`Row ${i + 2}: ${rowError.message}`);
        }
      }
    } catch (parseError) {
      errors.push(`Failed to parse workbook: ${parseError.message}`);
    }

    return { jobs, errors };
  }

  window.LinkedInCollectorImport = {
    parseWorkbook,
  };
})();
