(function() {
  'use strict';

  const REQUEST_TYPE = 'LJCS_REQUEST';
  const RESPONSE_TYPE = 'LJCS_RESPONSE';

  function getRequireFn() {
    return (typeof require === 'function' && require)
      || window.frames[0]?.require || null;
  }

  function getCacheRecord(cache, urn) {
    if (!cache || !urn) return null;
    const record = cache[urn];
    if (!record) return null;
    return record.__data || record._data || record;
  }

  function getStoreCache() {
    try {
      const requireFn = getRequireFn();
      if (typeof requireFn !== 'function') return null;
      const Ember = requireFn('ember').default;
      const app = Ember?.Namespace?.NAMESPACES?.find((item) => item.toString() === 'voyager-web');
      const store = app?.__container__?.lookup('service:store');
      return store?._globalM3RecordDataCache || null;
    } catch (_error) {
      return null;
    }
  }

  function getRemoteText(jobData, cache) {
    const workplaceUrns = Array.isArray(jobData['*jobWorkplaceTypes'])
      ? jobData['*jobWorkplaceTypes']
      : [];

    for (const urn of workplaceUrns) {
      const workplace = getCacheRecord(cache, urn);
      const localizedName = workplace?.localizedName || '';
      if (localizedName) return localizedName;
    }

    if (Array.isArray(jobData.jobWorkplaceTypes) && jobData.jobWorkplaceTypes.length === 0) {
      return 'not found';
    }

    return '';
  }

  function extractJob(jobId) {
    const cache = getStoreCache();
    if (!cache) return null;

    const jobUrn = `urn:li:fsd_jobPosting:${jobId}`;
    const descriptionUrn = `urn:li:fsd_jobDescription:${jobId}`;

    const jobData = getCacheRecord(cache, jobUrn);
    if (!jobData) return null;

    let companyName = jobData.companyDetails?.name || jobData.companyDetails?.companyName || '';
    if (!companyName && jobData.companyDetails?.jobCompany?.['*company']) {
      const companyData = getCacheRecord(cache, jobData.companyDetails.jobCompany['*company']);
      companyName = companyData?.name || '';
    }
    if (!companyName) {
      const companyUrn = jobData['*companyDetails'] || jobData['*company'];
      if (companyUrn) {
        const companyData = getCacheRecord(cache, companyUrn);
        companyName = companyData?.name || '';
      }
    }

    const locationData = getCacheRecord(cache, jobData['*location']);
    const employmentStatus = getCacheRecord(cache, jobData['*employmentStatus']);
    const descriptionData = getCacheRecord(cache, descriptionUrn);

    const descriptionText = jobData.description?.text
      || descriptionData?.descriptionText?.text
      || '';

    return {
      linkedin_job_id: String(jobId),
      title: jobData.title || '',
      company: companyName,
      external_url: jobData.companyApplyUrl || '',
      linkedin_link: `https://www.linkedin.com/jobs/view/${jobId}/`,
      location: locationData?.defaultLocalizedName || locationData?.defaultLocalizedNameWithoutCountryName || locationData?.abbreviatedLocalizedName || '',
      remote: getRemoteText(jobData, cache) || 'not found',
      job_type: employmentStatus?.localizedName || '',
      salary_range: '',
      description_text: descriptionText,
      deadline: jobData.expireAt || jobData.closedAt || '',
    };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== REQUEST_TYPE) return;

    const jobId = event.data.jobId;
    const data = jobId ? extractJob(jobId) : null;

    window.postMessage({
      type: RESPONSE_TYPE,
      jobId,
      data,
    }, '*');
  });
})();
