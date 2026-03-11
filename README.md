# LinkedIn Job Collector

A Chrome extension that automatically saves LinkedIn job listings as you browse and exports them to Excel.

---

## Installation

### Step 1: Download

1. Go to the download link you were given
2. Click the green **"Code"** button
3. Click **"Download ZIP"**
4. A file called `linkedin-job-collector-standalone-master.zip` will download to your computer

### Step 2: Unzip the folder

1. Find the downloaded ZIP file (usually in your **Downloads** folder)
2. **Right-click** the ZIP file
3. Click **"Extract All..."**
4. Click **"Extract"**
5. You should now have a folder called `linkedin-job-collector-standalone-master`
6. **Remember where this folder is** — do not delete it. Chrome needs it to stay on your computer for the extension to work.

### Step 3: Install in Chrome

1. Open Google Chrome
2. In the address bar, type `chrome://extensions` and press Enter
3. In the top-right corner, flip the **"Developer mode"** toggle ON (it will turn blue)
4. Click the **"Load unpacked"** button that appears in the top-left
5. Navigate to the `linkedin-job-collector-standalone-master` folder you unzipped
6. Select the folder and click **"Select Folder"**
7. The extension should now appear in your extensions list with a puzzle piece icon

### Step 4: Pin the extension (recommended)

1. Click the **puzzle piece icon** in the top-right of Chrome (next to the address bar)
2. Find **"LinkedIn Job Collector Standalone"** in the list
3. Click the **pin icon** next to it
4. The extension icon will now always be visible in your toolbar

---

## How to Use

### Collecting jobs

1. Go to [linkedin.com/jobs](https://www.linkedin.com/jobs/) and search for jobs
2. Click on any job listing to view its details
3. The extension **automatically saves** the job in the background — no clicking needed
4. Click the extension icon to see how many jobs you've saved

### Saving to a file (recommended method)

1. Click the extension icon to open the popup
2. Click **"Create Template"**
3. Choose where to save your file (e.g., Desktop) and give it a name like `my-jobs.xlsx`
4. **Keep the popup open** while you browse jobs — the file will update automatically as you collect
5. When you're done, open the file in Excel to see all your jobs

### Picking up where you left off

If you close the popup or restart Chrome:

1. Click the extension icon
2. Click **"Upload Sheet"**
3. Select the same `.xlsx` file you saved before
4. Your previous jobs are loaded back in, and auto-save reconnects to that file
5. Any edits you made in Excel (like adding notes) will be kept

### Quick export (alternative)

If you just want a one-time download without auto-save:

1. Click the extension icon
2. Click **"Export XLSX"**
3. A file will download to your Downloads folder

### Clearing saved jobs

1. Click the extension icon
2. Click **"Clear All"**
3. All saved jobs are removed from the extension (your exported files are not affected)

---

## What gets saved

Each job listing saves these fields:

| Column | Description |
|--------|-------------|
| linkedin_job_id | LinkedIn's internal job ID |
| company | Company name |
| title | Job title |
| location | Job location |
| remote | Remote, Hybrid, or On-site |
| job_type | Full-time, Internship, Contract, etc. |
| salary_range | Salary if listed |
| description | First 200 words of the job description |
| date_saved | Date you collected the job |
| date_applied | Empty — fill this in yourself in Excel |
| deadline | Application deadline if listed |
| url | External application link (if not Easy Apply) |
| linkedin_link | Direct link back to the job on LinkedIn |
| notes | Empty — add your own notes in Excel |

---

## Tips

- **Keep the popup open** while browsing for auto-save to work
- **Don't delete the extension folder** from your computer — Chrome needs it
- If the extension stops working after a Chrome update, go to `chrome://extensions` and click the refresh icon on the extension
- Your job data is stored in Chrome and will persist until you clear it, even if you close the browser

---

## Troubleshooting

**"No file connected" after reopening the popup**
This is normal. Click "Upload Sheet" and select your file to reconnect.

**Jobs aren't being collected**
Make sure you're on a LinkedIn jobs page (`linkedin.com/jobs/...`) and clicking on individual job listings.

**"Auto-save failed — file may be open"**
Close the Excel file, then collect another job. Auto-save will retry automatically.

**Extension disappeared from toolbar**
Go to `chrome://extensions`, make sure it's still enabled, then re-pin it using the puzzle piece icon.
