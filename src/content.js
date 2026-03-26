(function() {
  'use strict';

  const REQUEST_TYPE = 'LJCS_REQUEST';
  const RESPONSE_TYPE = 'LJCS_RESPONSE';
  const seenJobs = new Set();
  const pendingRequests = new Map();
  let observerActive = false;
  let currentUrl = window.location.href;
  let detailObserver = null;

  function syncState(statusText, statusClass, collected) {
    return window.LinkedInCollectorStore.setPopupState({
      collected,
      statusText,
      statusClass,
    });
  }

  function requestBridgeData(jobId) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(jobId);
        resolve(null);
      }, 2000);

      pendingRequests.set(jobId, { resolve, timer });
      window.postMessage({ type: REQUEST_TYPE, jobId }, '*');
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== RESPONSE_TYPE) return;

    const pending = pendingRequests.get(event.data.jobId);
    if (!pending) return;

    clearTimeout(pending.timer);
    pendingRequests.delete(event.data.jobId);
    pending.resolve(event.data.data);
  });

  function textContent(selector, root) {
    return root.querySelector(selector)?.textContent?.trim() || '';
  }

  function extractRemoteBadge(panel) {
    const tags = Array.from(panel.querySelectorAll('li, span, div')).map((node) => node.textContent?.trim() || '');
    return tags.find((value) => /^(Remote|Hybrid|On-site)$/i.test(value)) || '';
  }

  function extractJobTypeFallback(panel) {
    const buttons = Array.from(panel.querySelectorAll('.job-details-fit-level-preferences button'));
    for (const button of buttons) {
      const value = button.querySelector('strong')?.textContent?.trim() || button.textContent?.trim() || '';
      if (value) return value;
    }
    return '';
  }

  function extractDomFallbacks(panel, jobId) {
    return {
      linkedin_job_id: String(jobId),
      title: textContent('.job-details-jobs-unified-top-card__job-title h1', panel),
      company: textContent('.job-details-jobs-unified-top-card__company-name a', panel),
      external_url: '',
      linkedin_link: `https://www.linkedin.com/jobs/view/${jobId}/`,
      location: textContent('.tvm__text', panel),
      remote: extractRemoteBadge(panel),
      job_type: extractJobTypeFallback(panel),
      salary_range: textContent('.job-details-jobs-unified-top-card__salary-info', panel),
      description_text: textContent('#job-details', panel),
      deadline: '',
    };
  }

  function mergeExtraction(primary, fallback) {
    return {
      linkedin_job_id: primary?.linkedin_job_id || fallback.linkedin_job_id,
      title: primary?.title || fallback.title,
      company: primary?.company || fallback.company,
      external_url: primary?.external_url || fallback.external_url,
      linkedin_link: primary?.linkedin_link || fallback.linkedin_link,
      location: primary?.location || fallback.location,
      remote: primary?.remote || fallback.remote || 'not found',
      job_type: primary?.job_type || fallback.job_type,
      salary_range: primary?.salary_range || fallback.salary_range,
      description_text: primary?.description_text || fallback.description_text,
      deadline: primary?.deadline || fallback.deadline,
    };
  }

  async function collectCurrentJob() {
    const jobId = new URL(window.location.href).searchParams.get('currentJobId');
    if (!jobId || seenJobs.has(jobId)) return;

    const panel = document.querySelector('.scaffold-layout__detail');
    if (!panel) return;

    const [bridgeData, domData] = await Promise.all([
      requestBridgeData(jobId),
      Promise.resolve(extractDomFallbacks(panel, jobId)),
    ]);

    const merged = mergeExtraction(bridgeData, domData);
    const job = window.LinkedInCollectorSchema.createJobRecord(merged);
    if (!job.linkedin_job_id || !job.title || !job.company) return;

    const collected = await window.LinkedInCollectorStore.upsertJob(job);
    seenJobs.add(jobId);
    await syncState(`Saved: ${job.title}`, 'success', collected);
  }

  function observeDetailPanel() {
    if (observerActive) return;

    const container = document.querySelector('.jobs-search__job-details--container')
      || document.querySelector('.scaffold-layout__detail')
      || document.querySelector('[class*="job-details"]');

    if (!container) {
      setTimeout(observeDetailPanel, 2000);
      return;
    }

    let debounceTimer = null;
    let lastJobId = null;

    detailObserver = new MutationObserver(() => {
      const nextJobId = new URL(window.location.href).searchParams.get('currentJobId');
      if (nextJobId && nextJobId === lastJobId) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        lastJobId = nextJobId;
        collectCurrentJob().catch(async (error) => {
          await syncState(`Collection failed: ${error.message}`, 'error', seenJobs.size);
        });
      }, 500);
    });

    detailObserver.observe(container, { childList: true, subtree: true });
    observerActive = true;

    const initialJobId = new URL(window.location.href).searchParams.get('currentJobId');
    if (initialJobId) {
      lastJobId = initialJobId;
      collectCurrentJob().catch(async (error) => {
        await syncState(`Collection failed: ${error.message}`, 'error', seenJobs.size);
      });
    }
  }

  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      if (currentUrl.includes('/jobs/')) {
        if (detailObserver) {
          detailObserver.disconnect();
          detailObserver = null;
        }
        observerActive = false;
        observeDetailPanel();
      }
    }
  }, 2000);

  syncState('Ready - click a LinkedIn job to collect', '', 0);
  observeDetailPanel();
})();
