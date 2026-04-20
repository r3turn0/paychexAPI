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

Webhook server

To start the webhook server and receive Paychex events locally:

```bash
node webhook.js
```

Endpoints:
- `POST /webhook` : receives Paychex webhook events.
- `GET /health` : responds with `{ status: 'healthy' }`.
- `GET /test` : responds with server status and configured webhook URL.

Local testing

To verify the webhook logic locally without Paychex sending events:

```bash
node webhook.js test
```

This starts the server and sends a sample `WRKR_EMPL` payload to the local `/webhook` endpoint.

Webhook registration

Register webhook subscriptions in Paychex for supported worker domains:

```bash
node webhook.js register
```

List registered webhooks:

```bash
node webhook.js list
```

Configuration

- `WEBHOOK_PORT` : port used by local server (default `3000`).
- `WEBHOOK_URL` : full callback URL used when registering webhooks.

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
