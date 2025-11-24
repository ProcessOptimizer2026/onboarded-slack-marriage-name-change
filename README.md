## Slack ↔ Onboarded Marriage Name Change Integration

This project implements an **end-to-end integration** between **Slack** and **Onboarded** that automates a common HR workflow: updating an employee’s last name after marriage and generating a related compliance form.

When the employee completes the form in Onboarded, a completion notification is posted back into Slack.

This project demonstrates system connectivity, real-time webhook handling, data transformation, and clean integration design.

-----

## What the Integration Does

### 1\. Slack → Onboarded (Slash Command)

Users run a Slack command:

```
/marriage-name-change <email> <new_last_name>
```

The service performs the following actions:

  * Looks up the employee in Onboarded by email.
  * Updates their last name.
  * Creates a **“Marriage Name Change” task** in Onboarded.
  * Responds in Slack confirming the action.

### 2\. Onboarded → Slack (Webhook)

When the task is completed in Onboarded:

  * Onboarded sends a `task.updated` webhook.
  * The service receives it, verifies it matches the configured form.
  * It looks up the employee to generate a readable message.
  * Sends a **completion notification** into Slack.

-----

## Architecture

```
Slack Slash Command
        │
        ▼
Local Node.js Service (Express)
        │
        ▼
Onboarded API
        ▲
        │
        ▼
Onboarded Webhook → Local Node.js → Slack Incoming Webhook
```

### Core Components

  * **Node.js + Express**
  * **Slack Slash Command + Incoming Webhooks**
  * **Onboarded REST API**
  * **Onboarded Webhooks** (`task.updated`)
  * **Cloudflare Tunnel** (for exposing local server)

-----

## Running the Project Locally

### Prerequisites

  * **Node.js** (v18+ recommended)
  * **npm**
  * **Slack app** configured with:
      * Slash command
      * Incoming Webhook
  * **Onboarded staging credentials**
  * **Cloudflare Tunnel** or **ngrok** (to expose local server)

### 1\. Clone the repository

```bash
git clone https://github.com/ProcessOptimizer2026/onboarded-slack-marriage-name-change.git
cd onboarded-slack-marriage-name-change
```

### 2\. Install dependencies

```bash
npm install
```

### 3\. Environment configuration

Create your `.env` file:

```bash
cp .env.example .env
```

Fill in the required variables in `.env`.

### 4\. Start the application

```bash
npm run dev
```

The server runs on `http://localhost:3000`.

### 5\. Expose the server to the internet

*(Required for Slack + Onboarded webhooks)*

```bash
cloudflared tunnel --url http://localhost:3000
```

Use the generated public URL for:

  * **Slack Slash Command:** `/slack/commands`
  * **Onboarded Webhook:** `/onboarded/webhook`

-----

## Configuration Steps

### Slack Setup

#### Slash Command

  * **Command:** `/marriage-name-change`
  * **Request URL:** `https://<public-url>/slack/commands`
  * **Usage hint:** `<email> <new_last_name>`

#### Incoming Webhook

Used for posting completion notifications.

  * Add it to your `.env` under **`SLACK_COMPLETIONS_WEBHOOK_URL`**.

### Onboarded Setup

Create a webhook in Onboarded:

  * **URL:** `https://<public-url>/onboarded/webhook`
  * **Subscribed events:** `["task.updated"]`

Ensure you have:

  * A valid **API key** (for `.env`).
  * **Employer** created.
  * **“Marriage Name Change” form** created.

-----

## Project Structure

```
.
├── src
│   └── index.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

-----

## Security Notes

  * `.env` is excluded via `.gitignore`.
  * No secrets are committed to the repository.
  * All credentials are loaded via environment variables.
  * Webhooks are handled over HTTPS via the tunnel.
