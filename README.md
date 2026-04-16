# Paychex Direct Deposit Script

This repository contains a small Node.js script (`index.js`) that was written to
read a CSV of employee direct-deposit rows and post direct-deposit updates to
the Paychex API.

Important: this is the original, minimally-implemented automation script.
It requires configuration and hardening before using with real payroll data.

Quick start

1. Install Node.js (recommended v18+).
2. Put your CSV file next to `index.js` and name it `dd.csv`.
3. Run the script:

```bash
node index.js
```

Expected CSV

The script expects a headered CSV (example):

```
firstName,lastName,workerId,startDate,paymentType,accountType,value,routingNumber,accountNumber,priority
```

- `workerId` is optional if you can match by `firstName`+`lastName` to Paychex workers.
- The current parser is naive (splits on newlines) and does NOT support quoted
  fields or embedded commas. For production, replace with a CSV parser like
  `csv-parse` or `papaparse`.

Configuration

- The OAuth token request and client credentials are present in the code and
  must be supplied before running. Do NOT commit credentials to source control.
- Recommended: move `client_id` / `client_secret` to environment variables and
  use `URLSearchParams` for x-www-form-urlencoded token requests.

Power Automate / OneDrive integration

- Option 1 (recommended): host a secure HTTP endpoint (or Azure Function) that
  executes this processing. Build a Power Automate flow with trigger "When a
  file is created (OneDrive for Business)" and call the endpoint with the file
  contents.
- Option 2: run this script on a host that polls a OneDrive-synced folder for
  new files (less reliable).

Security & production checklist

- Do not hardcode secrets; use environment variables or a secrets store.
- Add input validation and a `--dry-run` mode to preview API payloads.
- Add retries and idempotency checks to prevent duplicate writes.
- Add logging and error handling; validate HTTP status codes and responses.

If you want, I can refactor the script to:
- parse CSV robustly,
- accept credentials via environment variables,
- add a dry-run mode,
- provide an Azure Function + Power Automate sample flow.
