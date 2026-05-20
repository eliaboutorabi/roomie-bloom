# Roomie Bloom

A colorful, phone-friendly utility app for two roommates to track shared expenses. Each expense records what it was, how much it cost, who paid, and the date. The app splits totals evenly and shows exactly who owes whom.

## Features

- Two-roommate setup with editable names
- Shared expense entry with amount, payer, and date
- Instant total, per-person paid amounts, and settle-up balance
- Expense history with delete and clear controls
- First-time walkthrough powered by Driver.js
- Local storage persistence in the browser
- Static GitHub Pages deployment through GitHub Actions

## Run Locally

Open `index.html` in a browser, or serve this folder with any static server:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Deploy On GitHub Pages

1. Create a GitHub repository and push this folder to the `main` branch.
2. In the repository, open **Settings > Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Push to `main`, or run the **Deploy to GitHub Pages** workflow manually.

The workflow in `.github/workflows/pages.yml` uploads the static site and publishes it to GitHub Pages.
