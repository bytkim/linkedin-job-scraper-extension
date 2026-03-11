(function() {
  'use strict';

  const countEl = document.getElementById('count');
  const statusEl = document.getElementById('status');
  const connectionDot = document.getElementById('connection-dot');
  const connectionText = document.getElementById('connection-text');
  const createTemplateButton = document.getElementById('create-template');
  const uploadSheetButton = document.getElementById('upload-sheet');
  const exportButton = document.getElementById('export');
  const clearButton = document.getElementById('clear');

  let fileHandle = null;
  let fileName = '';
  let autoSaveTimer = null;

  const XLSX_ACCEPT = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  };

  // --- Connection indicator ---

  function setConnected(name) {
    fileName = name;
    connectionDot.className = 'dot connected';
    connectionText.textContent = `Connected: ${name}`;
  }

  function setDisconnected(message) {
    fileName = '';
    connectionDot.className = 'dot';
    connectionText.textContent = message || 'No file connected';
  }

  function setWarning(message) {
    connectionDot.className = 'dot warning';
    connectionText.textContent = message;
  }

  // --- UI refresh ---

  function renderState(state, count) {
    countEl.textContent = String(count);
    statusEl.textContent = state?.statusText || 'Waiting for LinkedIn jobs page...';
    statusEl.className = `status ${state?.statusClass || ''}`.trim();
  }

  async function refresh() {
    const [jobs, state] = await Promise.all([
      window.LinkedInCollectorStore.getJobs(),
      window.LinkedInCollectorStore.getPopupState(),
    ]);
    renderState(state, jobs.length);
    return jobs;
  }

  // --- Auto-save ---

  async function autoSave() {
    if (!fileHandle) return;

    try {
      const jobs = await window.LinkedInCollectorStore.getJobs();
      const rows = jobs.map(window.LinkedInCollectorSchema.toExportRow);
      await window.LinkedInCollectorExport.writeToHandle(
        fileHandle, rows, window.LinkedInCollectorSchema.EXPORT_COLUMNS
      );
      setConnected(fileName);
      statusEl.textContent = `Auto-saved: ${jobs.length} job(s)`;
      statusEl.className = 'status success';
    } catch (error) {
      setWarning('Auto-save failed \u2014 file may be open');
      statusEl.textContent = `Auto-save error: ${error.message}`;
      statusEl.className = 'status warning';
    }
  }

  function scheduleAutoSave() {
    if (!fileHandle) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(autoSave, 500);
  }

  // --- Shared: write current data to handle ---

  async function writeCurrentData() {
    const jobs = await window.LinkedInCollectorStore.getJobs();
    const rows = jobs.map(window.LinkedInCollectorSchema.toExportRow);
    await window.LinkedInCollectorExport.writeToHandle(
      fileHandle, rows, window.LinkedInCollectorSchema.EXPORT_COLUMNS
    );
    return jobs.length;
  }

  // --- Create Template ---

  createTemplateButton.addEventListener('click', async () => {
    try {
      // showSaveFilePicker MUST be the first await (user-gesture constraint)
      const handle = await window.showSaveFilePicker({
        suggestedName: 'linkedin-jobs.xlsx',
        types: [{ description: 'Excel Workbook', accept: XLSX_ACCEPT }],
      });

      fileHandle = handle;
      const count = await writeCurrentData();
      setConnected(handle.name);
      statusEl.textContent = count > 0
        ? `Template created with ${count} job(s)`
        : 'Template created \u2014 ready to collect';
      statusEl.className = 'status success';
    } catch (error) {
      if (error.name === 'AbortError') return;
      statusEl.textContent = `Template failed: ${error.message}`;
      statusEl.className = 'status error';
    }
  });

  // --- Upload Sheet ---

  uploadSheetButton.addEventListener('click', async () => {
    try {
      // showOpenFilePicker MUST be the first await (user-gesture constraint)
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Excel Workbook', accept: XLSX_ACCEPT }],
        multiple: false,
      });

      // Request write permission immediately (still within user gesture window)
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        statusEl.textContent = 'Write permission denied';
        statusEl.className = 'status error';
        return;
      }

      // Read and parse
      const file = await handle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      const { jobs, errors } = window.LinkedInCollectorImport.parseWorkbook(arrayBuffer);

      if (errors.length > 0) {
        console.warn('[LinkedIn Collector] Import warnings:', errors);
      }

      if (jobs.length === 0 && errors.length > 0) {
        statusEl.textContent = `Import failed: ${errors[0]}`;
        statusEl.className = 'status error';
        return;
      }

      // Merge into storage (file wins)
      const totalCount = await window.LinkedInCollectorStore.bulkUpsert(jobs);

      // Set handle and write back merged data
      fileHandle = handle;
      await writeCurrentData();
      setConnected(handle.name);

      statusEl.textContent = `Imported ${jobs.length} job(s) (${totalCount} total)`;
      statusEl.className = 'status success';
      await refresh();
    } catch (error) {
      if (error.name === 'AbortError') return;
      statusEl.textContent = `Import failed: ${error.message}`;
      statusEl.className = 'status error';
    }
  });

  // --- Export (one-off download) ---

  exportButton.addEventListener('click', async () => {
    const jobs = await window.LinkedInCollectorStore.getJobs();
    const rows = jobs.map(window.LinkedInCollectorSchema.toExportRow);
    window.LinkedInCollectorExport.exportJobs(rows, window.LinkedInCollectorSchema.EXPORT_COLUMNS);
    statusEl.textContent = `Exported ${jobs.length} job(s)`;
    statusEl.className = 'status success';
  });

  // --- Clear All ---

  clearButton.addEventListener('click', async () => {
    await window.LinkedInCollectorStore.clearJobs();
    await window.LinkedInCollectorStore.setPopupState({
      collected: 0,
      statusText: 'Cleared saved jobs',
      statusClass: '',
    });
    await refresh();
  });

  // --- Storage change listener (UI refresh + auto-save) ---

  chrome.storage.onChanged.addListener(() => {
    refresh().catch(() => {});
    scheduleAutoSave();
  });

  // --- Init ---

  setDisconnected('No file connected');
  refresh().catch(() => {});
})();
