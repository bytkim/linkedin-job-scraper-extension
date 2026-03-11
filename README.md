# LinkedIn Job Collector Standalone

Standalone Chrome extension that passively collects LinkedIn job listings into `chrome.storage.local` and exports them to `.xlsx`.

## Load

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select `linkedin-job-collector-standalone`

## Usage

1. Open a LinkedIn jobs page
2. Click jobs to collect them
3. Open the extension popup
4. Click `Export XLSX`

## Notes

- Data is stored locally in the browser
- Exported workbook contains one sheet named `Jobs`
- The collector is LinkedIn-only
