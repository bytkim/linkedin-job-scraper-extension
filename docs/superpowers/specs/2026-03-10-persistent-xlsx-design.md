# Persistent XLSX Auto-Save Design

## Problem

Users must click Export XLSX each time to get their data, producing a new download every time. There is no way to maintain a single file that stays current as jobs are collected, and no way to import previous data back into the extension.

## Solution

Add a persistent XLSX workflow using the File System Access API and SheetJS:

1. **Create Template** — user picks a save location, extension writes a styled XLSX and holds the file handle
2. **Upload Sheet** — user picks an existing XLSX, extension reads it back into storage and re-establishes a write handle
3. **Auto-save** — while the popup is open and a file handle is active, every new job collection triggers an automatic rewrite of the XLSX

## Architecture

### Source of truth

`chrome.storage.local` remains the canonical data store. The XLSX file is a live mirror that gets rewritten on every change. Jobs are never lost if the file handle is lost — storage always has the data.

### SheetJS bundle

- Download `xlsx.full.min.js` v0.20.3 from SheetJS CDN at build/setup time
- Save locally as `lib/xlsx.full.min.js` at the **project root** (not inside `src/`)
- Loaded in `popup.html` via `<script src="../lib/xlsx.full.min.js">` (relative path from `src/popup.html` up to project root)
- No CDN fetches at runtime
- Used for both reading and writing XLSX
- SheetJS fully replaces the hand-rolled OOXML ZIP writer in `export.js` — the one-off Export XLSX button also uses SheetJS

### File handle lifecycle

The popup holds a `FileSystemFileHandle` in memory. The handle is lost when the popup closes or the browser restarts. This is a known constraint of the File System Access API — the UX handles it gracefully.

## Flows

### Create Template

1. User clicks "Create Template" — call `showSaveFilePicker()` as the **first await** in the click handler (user-gesture constraint: the File System Access API picker must be the first async call after the click event, or the browser rejects it with a SecurityError)
2. `showSaveFilePicker({ suggestedName: 'linkedin-jobs.xlsx' })` opens native file dialog
3. Extension builds workbook with styled header row (column widths, frozen row, autofilter)
4. Writes to handle via `handle.createWritable()` with `XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })`
5. If jobs already exist in `chrome.storage.local`, immediately rewrites with all data
6. Stores handle in popup memory, shows green connected indicator
7. Registers `chrome.storage.onChanged` auto-save listener

### Upload Sheet

1. User clicks "Upload Sheet" — call `showOpenFilePicker()` as the **first await** in the click handler (user-gesture token is consumed by the first async call; any preceding await would invalidate it)
2. Immediately request write permission on the returned handle: `handle.requestPermission({ mode: 'readwrite' })` — this must happen while the user-gesture token is still active (immediately after the picker resolves, before any other async work). If permission is denied, show a message and abort.
3. Extension reads file: `handle.getFile()` → `arrayBuffer()` → `XLSX.read(ab)`
4. Parses rows: `XLSX.utils.sheet_to_json(ws)` → array of row objects
5. Maps column headers to internal field names using `EXPORT_COLUMNS`
6. Upserts into `chrome.storage.local` via `bulkUpsert()` — **uploaded file wins** on `linkedin_job_id` conflicts (see Conflict Resolution below)
7. Rewrites file with merged dataset (storage + imported)
8. Shows connected indicator, starts auto-save listener

### Auto-save

The existing `chrome.storage.onChanged` listener in popup.js (used for UI refresh) is extended to also trigger auto-save. A single listener handles both concerns — no second listener needed.

1. `chrome.storage.onChanged` fires in popup.js
2. Refresh UI (existing behavior)
3. Check for active file handle — if none, skip file write
4. Debounce 500ms (prevents rapid consecutive writes during batch collection)
5. Read all jobs from storage → build workbook with styling → write to file handle
6. Update status: "Auto-saved: 24 jobs"
7. On write error: show warning, data is safe in storage, retry on next change

Note: the auto-save writes to the file handle only — it does not write back to `chrome.storage.local`. This means the `onChanged` listener cannot trigger an infinite loop. The listener fires on storage changes (from job collection or import), writes to the file, and stops.

### Conflict resolution (Upload Sheet)

`linkedin_job_id` must be present in the XLSX for round-trip dedup to work. `EXPORT_COLUMNS` in `schema.js` must be updated to include `linkedin_job_id` as the first column. This ensures every exported file contains the dedup key.

When `linkedin_job_id` exists in both storage and the uploaded file, **the uploaded file wins entirely** — the full row from the file replaces the storage row. Rationale: the XLSX was originally written from storage, so any differences represent intentional user edits in Excel. The user expects their edits to be preserved.

Merge rules:
- Row exists in both file and storage (same `linkedin_job_id`) → **file row wins**
- Row exists only in storage → **kept** (new jobs collected since last export)
- Row exists only in file → **added** (e.g., manually entered rows)

## Disconnected State Handling

The File System Access API is Chrome-only and the handle is lost when the popup closes.

### Handle loss scenarios

- Popup closed and reopened → handle gone from memory
- Browser restarted → handle gone
- File moved or deleted externally → `createWritable()` throws
- Permission revoked → `requestPermission()` returns `'denied'`

### UX states

| State | Indicator | Behavior |
|-------|-----------|----------|
| No file connected | Gray dot: "No file connected" | Create Template / Upload Sheet available |
| Connected, auto-saving | Green dot: "Connected: {filename}" | Auto-save active on every storage change |
| Write failed | Yellow dot: "Auto-save failed — file may be open" | Retry on next storage change |
| Handle lost (popup reopen) | Gray dot: "Reconnect to continue auto-saving" | Upload Sheet to reconnect |

On popup open: check if handle exists in memory. If not, show disconnected state with a prompt to reconnect. No error state — just clear guidance.

## XLSX Styling

Using SheetJS Community Edition capabilities only (no Pro edition, no OOXML injection):

- **Column widths** via `ws['!cols']` — sized per field:
  - linkedin_job_id: 16, company: 22, title: 36, location: 22, remote: 12
  - job_type: 14, salary_range: 18, description: 60
  - date_saved: 13, date_applied: 13, deadline: 13
  - url: 38, linkedin_link: 44, notes: 30
- **Frozen header row** — SheetJS CE may not support freeze panes; if `ws['!freeze']` is silently ignored, this feature is dropped (column widths and autofilter are the key usability features)
- **Autofilter** on header row — dropdown filters on every column

No bold/colored headers — column widths, frozen row, and autofilter provide the usability value without OOXML complexity.

## Popup UI Layout

```
LinkedIn Job Collector
+-------------------------------+
|  Saved jobs              24   |
|                               |
|  [Create Template]            |
|  [Upload Sheet]               |
|                               |
|  * Connected: jobs.xlsx       |  <- green/gray/yellow dot
|                               |
|  [Export XLSX]  [Clear All]   |  <- Export stays as manual one-off
|                               |
|  Ready - click a job...       |
+-------------------------------+
```

- **Create Template** and **Upload Sheet** are primary actions
- **Connection indicator** shows auto-save state and filename
- **Export XLSX** stays as a fallback one-off download (no file handle needed)
- **Clear All** calls `clearJobs()` which triggers `chrome.storage.onChanged`, which triggers auto-save, which writes a headers-only file. No explicit write needed in the Clear All handler — auto-save handles it naturally.

## Files Changed

| File | Change |
|------|--------|
| `lib/xlsx.full.min.js` | New — bundled SheetJS v0.20.3 standalone |
| `src/export.js` | Rewrite — replace hand-rolled OOXML ZIP writer entirely with SheetJS. Expose `buildWorkbook(rows, columns)` for shared use by both one-off Export and auto-save. Expose `writeToHandle(handle, rows, columns)` for auto-save. Keep `exportJobs(rows, columns)` for the one-off download (uses `XLSX.writeFile` or Blob download). |
| `src/import.js` | New — XLSX reader using SheetJS. Exports `window.LinkedInCollectorImport = { parseWorkbook(arrayBuffer) }`. Returns `{ jobs: [{...}, ...], errors: [] }`. Maps XLSX column headers to internal field names. Rows missing `linkedin_job_id` are assigned a generated key from `linkedin_link` URL. Parse errors are collected (not thrown) so partial imports succeed. |
| `src/popup.html` | Add scripts and buttons. Full script-load order: `../lib/xlsx.full.min.js` → `schema.js` → `store.js` → `export.js` → `import.js` → `popup.js`. Add Create Template, Upload Sheet buttons and connection indicator element. |
| `src/popup.js` | File handle management, auto-save listener via chrome.storage.onChanged, new button handlers, disconnected state UX |
| `src/schema.js` | Reorder `EXPORT_COLUMNS` to: `linkedin_job_id`, `company`, `title`, `location`, `remote`, `job_type`, `salary_range`, `description`, `date_saved`, `date_applied`, `deadline`, `url`, `linkedin_link`, `notes`. Remove `source`, `status`, `follow_up_date`, `recruiter_name`, `recruiter_email`. Add `notes` (empty, user-editable). Remove corresponding fields from `createJobRecord`. |
| `src/store.js` | Add `bulkUpsert(jobs)` method for import (uploaded file wins on conflicts) |
| `manifest.json` | No change |

## Constraints

- File System Access API is Chrome-only (this is a Chrome extension, so acceptable)
- File handle lost on popup close — by design, reconnect via Upload Sheet
- SheetJS Community Edition has limited cell styling — accepted, using column widths/freeze/autofilter only
- `chrome.storage.local` size limit is ~10MB with `unlimitedStorage` permission (already declared) — sufficient for thousands of job records
