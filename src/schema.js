(function() {
  'use strict';

  const EXPORT_COLUMNS = [
    'linkedin_job_id',
    'company',
    'title',
    'location',
    'remote',
    'job_type',
    'salary_range',
    'description',
    'date_saved',
    'date_applied',
    'deadline',
    'url',
    'linkedin_link',
    'notes',
  ];

  function todayString() {
    return new Date().toLocaleDateString('en-CA');
  }

  function toDateOnly(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-CA');
  }

  function firstWords(text, limit) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    return words.slice(0, limit).join(' ');
  }

  function extractSalarySnippet(text) {
    const match = String(text || '').match(
      /\$[\d,]+(?:\s*[-–]\s*\$?[\d,]+)?(?:\s*(?:\/hr|\/hour|\/year|k\/year|K))?/i
    );
    return match ? match[0] : 'not found';
  }

  function normalizeText(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function createJobRecord(data) {
    const descriptionText = String(data.description_text || '').trim();
    const externalUrl = String(data.external_url || '').trim();
    const linkedinLink = String(data.linkedin_link || '').trim();
    const salaryFromApi = String(data.salary_range || '').trim();

    return {
      linkedin_job_id: String(data.linkedin_job_id || '').trim(),
      company: normalizeText(data.company, ''),
      title: normalizeText(data.title, ''),
      location: normalizeText(data.location, ''),
      remote: normalizeText(data.remote, 'not found'),
      job_type: normalizeText(data.job_type, ''),
      salary_range: salaryFromApi || extractSalarySnippet(descriptionText),
      description: firstWords(descriptionText, 200),
      date_saved: todayString(),
      date_applied: '',
      deadline: toDateOnly(data.deadline),
      url: externalUrl || linkedinLink,
      linkedin_link: linkedinLink,
      notes: '',
      collected_at: new Date().toISOString(),
    };
  }

  function toExportRow(job) {
    const row = {};
    for (const column of EXPORT_COLUMNS) {
      row[column] = job[column] || '';
    }
    return row;
  }

  window.LinkedInCollectorSchema = {
    EXPORT_COLUMNS,
    createJobRecord,
    toExportRow,
    toDateOnly,
  };
})();
