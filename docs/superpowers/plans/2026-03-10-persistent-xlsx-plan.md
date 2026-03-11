# Persistent XLSX Auto-Save Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled XLSX export with SheetJS, add persistent file handle auto-save, and add XLSX import for round-trip editing.

**Architecture:** SheetJS handles all XLSX read/write. The popup manages a `FileSystemFileHandle` in memory. On every `chrome.storage.onChanged` event, if a handle is active, the popup debounces and rewrites the XLSX. Import parses an uploaded XLSX back into storage with "file wins" conflict resolution.

**Tech Stack:** SheetJS CE v0.20.3 (bundled), File System Access API, Chrome Extension MV3

**Spec:** `docs/superpowers/specs/2026-03-10-persistent-xlsx-design.md`

---

## File Structure

| File | Role | Status |
|------|------|--------|
| `lib/xlsx.full.min.js` | SheetJS v0.20.3 standalone bundle | Create (download) |
| `src/export.js` | XLSX write via SheetJS — `buildWorkbook()`, `writeToHandle()`, `exportJobs()` | Rewrite |
| `src/import.js` | XLSX read via SheetJS — `parseWorkbook(arrayBuffer)` | Create |
| `src/store.js` | Add `bulkUpsert(jobs)` | Modify |
| `src/popup.html` | New buttons, connection indicator, script load order | Modify |
| `src/popup.js` | File handle management, auto-save, new button handlers | Rewrite |
| `src/schema.js` | Already updated (EXPORT_COLUMNS reordered, notes added, removed source/status/follow_up_date/recruiter_name/recruiter_email from createJobRecord). `collected_at` remains as internal metadata — not in EXPORT_COLUMNS but kept in storage for debugging. | No change needed |

---

## Task 1: Download SheetJS bundle

**Files:**
- Create: `lib/xlsx.full.min.js`

- [ ] **Step 1: Download SheetJS CE standalone**

```bash
mkdir -p lib
curl -L -o lib/xlsx.full.min.js https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
```

- [ ] **Step 2: Verify the file exists and is non-trivial**

```bash
ls -la lib/xlsx.full.min.js
```

Expected: file exists, ~500KB+

- [ ] **Step 3: Commit**

```bash
git add lib/xlsx.full.min.js
git commit -m "chore: bundle SheetJS CE v0.20.3 for XLSX read/write"
```

---

## Task 2: Rewrite export.js with SheetJS

**Files:**
- Rewrite: `src/export.js`

This replaces the entire hand-rolled OOXML ZIP writer with SheetJS. Exposes three functions:
- `buildWorkbook(rows, columns)` — creates a SheetJS workbook object with styling
- `writeToHandle(handle, rows, columns)` — writes workbook to a FileSystemFileHandle
- `exportJobs(rows, columns)` — one-off download via Blob URL

- [ ] **Step 1: Write the new export.js**

```javascript
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
```

- [ ] **Step 2: Verify by loading the extension and clicking Export XLSX**

Load the unpacked extension in Chrome. Navigate to a LinkedIn jobs page, collect a job, open popup, click Export XLSX. Verify the downloaded file opens in Excel with correct columns, column widths, and frozen header row.

- [ ] **Step 3: Commit**

```bash
git add src/export.js
git commit -m "feat: rewrite export.js to use SheetJS for XLSX generation"
```

---

## Task 3: Create import.js

**Files:**
- Create: `src/import.js`

Reads an XLSX ArrayBuffer using SheetJS, maps headers to field names, returns structured job objects.

- [ ] **Step 1: Write import.js**

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/import.js
git commit -m "feat: add import.js for XLSX round-trip reading via SheetJS"
```

---

## Task 4: Add bulkUpsert to store.js

**Files:**
- Modify: `src/store.js`

Adds `bulkUpsert(jobs)` — uploaded file wins on conflicts.

- [ ] **Step 1: Add bulkUpsert function**

Add immediately before the `window.LinkedInCollectorStore = {` line in `src/store.js`:

```javascript
  async function bulkUpsert(importedJobs) {
    const jobsById = await getJobsById();
    for (const job of importedJobs) {
      if (!job.linkedin_job_id) continue;
      // Uploaded file wins — overwrite storage record entirely
      jobsById[job.linkedin_job_id] = job;
    }
    await setStorage({ [JOBS_KEY]: jobsById });
    return Object.keys(jobsById).length;
  }
```

- [ ] **Step 2: Expose bulkUpsert in the window export**

Update `window.LinkedInCollectorStore` to include `bulkUpsert`:

```javascript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/store.js
git commit -m "feat: add bulkUpsert to store.js for XLSX import merge"
```

---

## Task 5: Update popup.html

**Files:**
- Modify: `src/popup.html`

Add SheetJS script, import.js script, new buttons (Create Template, Upload Sheet), and connection indicator element.

- [ ] **Step 1: Replace the full popup.html content**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>LinkedIn Job Collector</title>
  <style>
    body {
      width: 300px;
      margin: 0;
      padding: 14px;
      font-family: "Segoe UI", Tahoma, sans-serif;
      font-size: 13px;
      color: #1f1f1f;
      background: #f7f8fa;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 15px;
    }

    .card {
      background: #fff;
      border: 1px solid #d9dde3;
      border-radius: 10px;
      padding: 12px;
    }

    .stat {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .status {
      min-height: 32px;
      color: #5f6b7a;
      margin-top: 10px;
    }

    .status.success {
      color: #0f6a37;
    }

    .status.error {
      color: #a12727;
    }

    .status.warning {
      color: #b45309;
    }

    .file-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 10px;
    }

    .file-actions button {
      width: 100%;
      border: 1px solid #d9dde3;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
      background: #fff;
      color: #1f1f1f;
    }

    .file-actions button:hover {
      background: #f0f2f5;
    }

    .connection {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
      color: #5f6b7a;
    }

    .connection .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #9ca3af;
      flex-shrink: 0;
    }

    .connection .dot.connected {
      background: #16a34a;
    }

    .connection .dot.warning {
      background: #d97706;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .actions button {
      flex: 1;
      border: 0;
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      font: inherit;
    }

    #export {
      background: #0a66c2;
      color: #fff;
    }

    #clear {
      background: #e8edf3;
      color: #223041;
    }
  </style>
</head>
<body>
  <h1>LinkedIn Job Collector</h1>
  <div class="card">
    <div class="stat">
      <span>Saved jobs</span>
      <strong id="count">0</strong>
    </div>

    <div class="file-actions">
      <button id="create-template">Create Template</button>
      <button id="upload-sheet">Upload Sheet</button>
    </div>

    <div class="connection" id="connection">
      <span class="dot" id="connection-dot"></span>
      <span id="connection-text">No file connected</span>
    </div>

    <div class="actions">
      <button id="export">Export XLSX</button>
      <button id="clear">Clear All</button>
    </div>

    <div class="status" id="status">Waiting for LinkedIn jobs page...</div>
  </div>
  <script src="../lib/xlsx.full.min.js"></script>
  <script src="schema.js"></script>
  <script src="store.js"></script>
  <script src="export.js"></script>
  <script src="import.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/popup.html
git commit -m "feat: update popup.html with file actions, connection indicator, and SheetJS"
```

---

## Task 6: Rewrite popup.js

**Depends on:** Tasks 2 (export.js), 3 (import.js), 4 (store.js bulkUpsert), 5 (popup.html)

**Files:**
- Rewrite: `src/popup.js`

This is the main integration point. Handles:
- File handle state (Create Template, Upload Sheet)
- Connection indicator UX
- Auto-save via extended `chrome.storage.onChanged` listener
- Debounced writes
- Error handling for lost/locked handles

- [ ] **Step 1: Write the new popup.js**

```javascript
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
      if (error.name === 'AbortError') return; // user cancelled picker
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
      if (error.name === 'AbortError') return; // user cancelled picker
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
    // Auto-save will fire via onChanged and write headers-only file if connected
    await refresh();
  });

  // --- Storage change listener (UI refresh + auto-save) ---

  chrome.storage.onChanged.addListener(() => {
    refresh().catch(() => {});
    scheduleAutoSave();
  });

  // --- Init ---
  // Spec lists a separate "Reconnect to continue auto-saving" state for popup reopen.
  // Since file handles cannot persist across popup close, there is no way to distinguish
  // "never connected" from "was connected, popup closed." We always show "No file connected"
  // and let the user click Upload Sheet to reconnect. This is the simplest correct behavior.

  setDisconnected('No file connected');
  refresh().catch(() => {});
})();
```

- [ ] **Step 2: Load extension and test all flows**

1. Open popup — verify "No file connected" with gray dot
2. Click "Create Template" — pick a save location — verify green dot "Connected: filename.xlsx" and file is created
3. Navigate to LinkedIn jobs, collect a job — verify popup shows "Auto-saved: N job(s)" and the file updates
4. Close popup, reopen — verify gray dot "No file connected"
5. Click "Upload Sheet" — select the previously created file — verify jobs load, green dot reconnects
6. Click "Export XLSX" — verify one-off download still works
7. Click "Clear All" — verify file is rewritten with headers only (if connected)

- [ ] **Step 3: Commit**

```bash
git add src/popup.js
git commit -m "feat: rewrite popup.js with file handle management and auto-save"
```

---

## Task 7: End-to-end verification

- [ ] **Step 1: Full round-trip test**

1. Load extension, go to LinkedIn jobs page
2. Click several different job listings to collect them
3. Open popup — verify count matches
4. Click "Create Template" — save as `test-jobs.xlsx`
5. Open `test-jobs.xlsx` in Excel — verify columns: linkedin_job_id, company, title, location, remote, job_type, salary_range, description, date_saved, date_applied, deadline, url, linkedin_link, notes
6. Verify column widths are reasonable and header row is frozen
7. Edit the `notes` column for a few rows in Excel, save the file
8. Close the popup, reopen it
9. Click "Upload Sheet" — select `test-jobs.xlsx`
10. Verify the notes column values are now in storage (file wins)
11. Collect another job — verify it appears in the file (auto-save)
12. Click "Export XLSX" — verify one-off download contains all jobs including notes

- [ ] **Step 2: Error handling test**

1. Connect to a file, then open it in Excel (locking it)
2. Collect a new job — verify yellow dot "Auto-save failed" appears
3. Close Excel — collect another job — verify auto-save recovers

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```
