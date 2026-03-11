(function() {
  'use strict';

  const JOBS_KEY = 'ljcs_jobs_by_id';
  const STATE_KEY = 'ljcs_popup_state';

  function getStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function setStorage(value) {
    return new Promise((resolve) => chrome.storage.local.set(value, resolve));
  }

  async function getJobsById() {
    const data = await getStorage(JOBS_KEY);
    return data[JOBS_KEY] || {};
  }

  async function getJobs() {
    const jobsById = await getJobsById();
    return Object.values(jobsById).sort((a, b) => {
      return String(b.date_saved || '').localeCompare(String(a.date_saved || ''));
    });
  }

  async function upsertJob(job) {
    const jobsById = await getJobsById();
    jobsById[job.linkedin_job_id] = job;
    await setStorage({ [JOBS_KEY]: jobsById });
    return Object.keys(jobsById).length;
  }

  async function clearJobs() {
    await setStorage({ [JOBS_KEY]: {} });
  }

  async function setPopupState(state) {
    await setStorage({ [STATE_KEY]: state });
  }

  async function getPopupState() {
    const data = await getStorage(STATE_KEY);
    return data[STATE_KEY] || null;
  }

  async function bulkUpsert(importedJobs) {
    const jobsById = await getJobsById();
    for (const job of importedJobs) {
      if (!job.linkedin_job_id) continue;
      jobsById[job.linkedin_job_id] = job;
    }
    await setStorage({ [JOBS_KEY]: jobsById });
    return Object.keys(jobsById).length;
  }

  window.LinkedInCollectorStore = {
    JOBS_KEY,
    STATE_KEY,
    getJobsById,
    getJobs,
    upsertJob,
    bulkUpsert,
    clearJobs,
    setPopupState,
    getPopupState,
  };
})();
