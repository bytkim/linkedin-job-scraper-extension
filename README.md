# LinkedIn Job Scraper Extension

A Chrome extension that automatically collects LinkedIn job listings as you browse and exports them to Excel. All data stays on your machine -- nothing is sent to any server.

## Features

- Automatically captures job details when you click on a listing
- Exports to `.xlsx` with one click
- Persistent file connection with auto-save
- Import/export to pick up where you left off
- Works entirely offline -- no accounts, no API keys, no tracking

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked** and select the project folder
5. Pin the extension for easy access (puzzle piece icon > pin)

> Do not delete the extension folder after loading -- Chrome needs it to stay on disk.

## Usage

### Collecting Jobs

1. Go to [linkedin.com/jobs](https://www.linkedin.com/jobs/) and search for jobs
2. Click on any job listing to view its details
3. The extension automatically saves the job -- no extra clicks needed
4. Click the extension icon to see your saved count

### Saving to a File

1. Click the extension icon
2. Click **Create Template** to create a new `.xlsx` file, or **Upload Sheet** to reconnect an existing one
3. Keep the popup open while browsing -- the file auto-saves as you collect
4. Open the file in Excel to review, add notes, or mark applications

### Quick Export

Click **Export XLSX** for a one-time download without setting up auto-save.

### Clearing Data

Click **Clear All** to remove all saved jobs from the extension. Previously exported files are not affected.

## Data Collected

Each job listing captures the following fields:

| Field | Description |
|-------|-------------|
| `linkedin_job_id` | LinkedIn's internal job ID |
| `company` | Company name |
| `title` | Job title |
| `location` | Job location |
| `remote` | Remote, Hybrid, or On-site |
| `job_type` | Full-time, Internship, Contract, etc. |
| `salary_range` | Salary if listed |
| `description` | First 200 words of the job description |
| `date_saved` | Date you collected the job |
| `date_applied` | Empty -- fill in yourself |
| `deadline` | Application deadline if listed |
| `url` | External application link |
| `linkedin_link` | Direct link to the job on LinkedIn |
| `notes` | Empty -- add your own notes |

## Privacy

- **No network requests.** The extension makes zero external HTTP calls. All data is stored locally in Chrome's `storage.local` API and exported to files on your machine.
- **No analytics or telemetry.** No usage data, identifiers, or browsing activity is collected or transmitted.
- **Minimal permissions.** The extension only requests `storage` and access to `linkedin.com/jobs` pages.
- **No personal data.** Only publicly visible job posting information is captured. No user profiles, credentials, or session data are accessed.

## Troubleshooting

**"No file connected" after reopening the popup**
Click **Upload Sheet** and select your file to reconnect. The browser cannot persist file handles across sessions.

**Jobs aren't being collected**
Make sure you're on a LinkedIn jobs page (`linkedin.com/jobs/...`) and clicking on individual job listings.

**"Auto-save failed -- file may be open"**
Close the file in Excel, then collect another job. Auto-save retries automatically on the next change.

**Extension disappeared from toolbar**
Go to `chrome://extensions`, make sure it's enabled, then re-pin it.

## License

MIT
