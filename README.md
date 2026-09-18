# Razyyn AI — Accountant Agent for Frappe & ERPNext v14

[![Frappe Version](https://img.shields.io/badge/Frappe-v14-blue.svg?style=flat-square)](https://frappeframework.com)
[![ERPNext Version](https://img.shields.io/badge/ERPNext-v14-blueviolet.svg?style=flat-square)](https://erpnext.com)
[![Python Version](https://img.shields.io/badge/Python-3.10%2B-green.svg?style=flat-square)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-amber.svg?style=flat-square)](license.txt)
[![Status](https://img.shields.io/badge/Production-Ready-success.svg?style=flat-square)](#)

> **Your complete finance department, powered by AI.**
>
> Learn more at [razyyn.com](https://razyyn.com).

Razyyn AI adds a natural-language finance team to your ERPNext Desk that can answer accounting questions, analyze your financials, audit your ledgers, reconcile bank statements, and prepare accounting entries for your review — all without leaving ERPNext, and never touching your books without your explicit approval.

It works the way your finance department is supposed to: securely, and in line with **your company's own policies, your country's tax and regulatory rules, and standard accounting principles (IFRS / GAAP)** — all configurable, so the agent reasons and acts the way your organization actually operates.

---

## Table of Contents

- [What Razyyn AI Does](#what-razyyn-ai-does)
- [Prerequisites & System Requirements](#prerequisites--system-requirements)
- [Installation Guide](#installation-guide)
- [Connecting Your ERP](#connecting-your-erp)
- [Configuration Guide](#configuration-guide)
  - [1. Agent Settings](#1-agent-settings)
  - [2. Agent Write Policy (Guardrails for Ledger Writes)](#2-agent-write-policy-guardrails-for-ledger-writes)
  - [3. Agent Messaging Settings (Email, Telegram & Slack)](#3-agent-messaging-settings-email-telegram--slack)
  - [4. ERP Role & User Permissions](#4-erp-role--user-permissions)
- [Auditability & Observability](#auditability--observability)
- [Usage Examples](#usage-examples)
- [Troubleshooting & FAQs](#troubleshooting--faqs)
- [Security, Privacy & Compliance](#security-privacy--compliance)
- [License & Support](#license--support)

---

## What Razyyn AI Does

Accounting work is complex and high-stakes — a simple chatbot isn't enough to reconcile accounts, spot irregularities, or post ledger entries reliably. Razyyn AI is built specifically for the job, directly inside your ERPNext Desk:

- **Ask accounting questions & look things up.** Chart of accounts, customer balances, vendor status, tax rates, IFRS/GAAP guidance — answered against your live data.
- **Analyze your finances.** Ratios, aging, budget variances, and trend analysis, with interactive charts rendered right in the chat.
- **Audit your ledgers.** Flags anomalies, duplicate payments, round-sum transactions, off-hours postings, and other internal-control red flags, with severity ratings and remediation notes.
- **Reconcile bank statements.** Upload a statement (CSV/Excel/PDF) and Razyyn AI matches it against your ledger, classifying differences and proposing settlement entries.
- **Read your documents.** Extracts data from uploaded invoices, receipts, and contracts (PDF, DOCX, CSV, Excel, images).
- **Prepare and post entries — with your approval.** Journal Entries, Payment Entries, Sales/Purchase Invoices, Customers, and Suppliers are proposed as a clear card showing every debit, credit, tax, and party. Nothing is written to your books until you click **Approve**.
- **Export & deliver results.** Generates PDF, Excel, CSV, and TXT deliverables, and can send reports and alerts by **Email**, **Telegram**, or **Slack**.
- **Zero-credential connection.** No API keys to copy or paste — your ERP connects to Razyyn AI securely in one click.
- **Fail-closed by default.** Out of the box, the agent has zero write permissions. Every write is bound by both your ERPNext role permissions and a server-enforced write policy you control.
- **Compliant by configuration.** Teach the agent your company's policies, your country's tax and regulatory rules, and your chart of accounts conventions in **Agent Settings**, and every answer, entry, and audit finding respects them — grounded in standard accounting principles (IFRS / GAAP) by default.
- **Secure end-to-end.** Encrypted credentials, an append-only audit trail, and strict tenant data isolation protect your books and your data at every step.

---

## Prerequisites & System Requirements

| Component | Requirement |
|---|---|
| **Frappe Framework** | Version 14.x |
| **ERPNext** | Version 14.x |
| **Python** | Python 3.10, 3.11, or 3.12 |
| **Python Dependencies** | `pymupdf`, `python-docx`, `pandas`, `python-pptx`, `pillow`, `requests`, `pytesseract`, `pdf2image` (managed automatically via `pyproject.toml`) |
| **System Packages (for OCR)** | `tesseract-ocr` (with the language data you need, e.g. `eng`, `ara`) and `poppler-utils`, installed via your OS package manager |
| **Database** | MariaDB 10.6+ or PostgreSQL 14+ |
| **Browser Support** | Modern Chrome, Firefox, Safari, Edge (Desktop & Tablet) |

---

## Installation Guide

### Step 1: Download the App into Your Bench
Open a terminal in your bench directory and run:
```bash
cd /path/to/frappe-bench
bench get-app accountant_agent https://github.com/Marwan-badr543/Razyyn-AI-Frappe --branch Razyyn-AI-Frappe-v14
```

### Step 2: Install the App on Your Site
```bash
bench --site [your-site-name] install-app accountant_agent
```

### Step 3: Run Database Migrations
This ensures all DocTypes (`Agent Settings`, `Agent Write Policy`, `Agent Write Log`, etc.), custom permissions, and the system user `accountant-agent@agent.local` are fully provisioned:
```bash
bench --site [your-site-name] migrate
```

### Step 4: Build Assets & Restart Bench
Compile frontend JavaScript/CSS bundles and reload bench workers:
```bash
bench build --app accountant_agent
bench restart
```

---

## Connecting Your ERP

Traditional integrations force administrators to generate API keys and copy secrets between apps. Razyyn AI eliminates this with **zero-credential, self-service onboarding**:

```
  [Open /app/agent-chat] ──► [Sign In / Register] ──► [Click "Connect"] ──► [Ready to Operate]
```

1. Log in to your ERPNext instance as a **System Manager**.
2. In the Awesomebar, navigate to **Razyyn AI** or visit `/app/agent-chat`.
3. If you have not created an account yet, register your email; otherwise, sign in using your Razyyn credentials.
4. Open **Agent Settings** (`/app/agent-settings`) and scroll down to **Creator Agent — Recording Access**.
5. Click **Connect**:
   - The app automatically creates a dedicated robot user `accountant-agent@agent.local`.
   - It issues a unique API key and secret pair.
   - It sends the connection parameters securely to Razyyn AI over your active authenticated session.
   - The status badge changes to **Connected — not recording**.
6. When you are ready for the agent to save draft or submitted documents, click **Allow recording** and enable writes in your **Agent Write Policy**.

> [!NOTE]
> Connecting establishes identity only. Out-of-the-box, the agent holds **zero business permissions** and **recording is disabled**. You retain absolute control over what it can access.

---

## Configuration Guide

### 1. Agent Settings
> **Route:** `/app/agent-settings` | **Access:** System Manager

`Agent Settings` links each ERP user with their Razyyn AI platform account.

| Field Name | Type | Description & Purpose | How to Configure |
|---|---|---|---|
| **Email** (`email`) | Data | The email address registered with Razyyn AI. | Auto-populated upon sign-in from the chat interface. |
| **API Key** (`api_key`) | Password | Encrypted platform secret key authenticating requests to Razyyn. | Managed automatically by the onboarding handshake. |
| **Access Token** (`access_token`) | Password | Bearer JWT token storing active session claims. | Handled automatically during sign-in. |
| **Custom Instructions** (`custom_instructions`) | Long Text | Custom behavioral prompt, corporate accounting rules, tax guidelines, or operational tone. | **Recommended:** Input standard operating procedures (e.g., *"Always use FIFO for inventory valuation. Default cost center is 'Main'. Treat invoices over $5,000 with high scrutiny."*). |

#### Teaching the Agent Your Company, Country & Accounting Rules

`Custom Instructions` is where you make Razyyn AI operate as **your** finance department, not a generic one. Anything typed here is applied to every question, analysis, audit, and entry the agent produces. As a rule of thumb, cover three layers:

1. **Company policy** — your internal SOPs and thresholds.
   > *"Default company is 'Acme Global FZE'. Default cost center is 'Head Office'. Purchase invoices above $5,000 require a Finance Manager's approval before posting. Always use FIFO for inventory valuation."*
2. **Country & regulatory rules** — the tax regime and statutory requirements you operate under.
   > *"We operate under UAE VAT law (5% standard rate). Apply reverse charge for imported services. Retain supporting documents for 5 years per FTA requirements. Do not backdate entries into a closed VAT period."*
3. **Accounting principles** — the framework your financial statements follow.
   > *"Report under IFRS. Recognize subscription revenue over the service period per IFRS 15. Classify leases per IFRS 16."*

> [!TIP]
> Keep instructions short, specific, and stated as rules (not prose) — the agent applies them literally on every task, so precise thresholds and named accounts work far better than general guidance.

#### Usage Dashboard
The form displays a live dashboard reporting:
- **Plan Tier Badge:** `Free`, `Plus`, `Pro`, `Ultra`, or a custom plan, colour-coded on the card.
- **Billing Cycle Usage Bar:** Percentage of your 30-day billing cycle quota consumed.
- **Refresh Stats Button:** Instantly queries the platform for updated usage metrics.

#### Creator Agent — Recording Access Card
- **Connection Status Badges:**
  - `Ready to record` *(Green)*: Connected, recording is toggled on, and Agent Write Policy is enabled.
  - `Connected — not recording` *(Yellow)*: Connected to platform, but recording switch is disabled.
  - `Blocked by Agent Write Policy` *(Red)*: Connected, but Master Switch in Agent Write Policy is turned off.
  - `Not connected` *(Red)*: ERP has not yet established a handshake with Razyyn AI.
- **Action Controls:**
  - **Connect / Disconnect:** Provisions the agent user and links the site, or terminates the connection and revokes stored credentials.
  - **Allow recording / Stop recording:** Fast master toggle for transactional recording without modifying user roles.
  - **Issue new credentials:** Immediately rotates the ERP API key and secret for `accountant-agent@agent.local` if a credential leak is suspected.

---

### 2. Agent Write Policy (Guardrails for Ledger Writes)
> **Route:** `/app/agent-write-policy` | **Type:** Single DocType | **Access:** System Manager

The **Agent Write Policy** is your organization's server-side safety harness. It is enforced inside your ERPNext database engine on every write attempt — **no write violating this policy can ever be committed to the database**.

#### A. Master Switch Section
| Field | Type | Default | Description | Best Practice |
|---|---|---|---|---|
| **Enable Agent Writes** (`enabled`) | Check | `0` (Off) | Master kill-switch. While unchecked, the agent is 100% read-only. | Keep unchecked until setup is fully reviewed. |
| **Dry Run Only** (`dry_run_only`) | Check | `0` (Off) | Evaluation mode. The agent simulates and validates all document structures but rolls back transactions before saving. | **Enable for the first 2 weeks of deployment** to verify accuracy. |
| **Require Human Approval** (`require_approval`) | Check | `1` (On) | Requires a user to click "Approve" on the proposal card in chat before any record is created. | Keep enabled for maximum governance. |

#### B. Permitted Document Types Section
| Field | Type | Description |
|---|---|---|
| **Restrict To Listed Document Types** (`restrict_to_listed_doctypes`) | Check | When `0` (default), the agent may prepare any document allowed by `accountant-agent@agent.local`'s ERP roles. When `1`, writes are strictly restricted to the child table below. |
| **Allowed Document Types** (`allowed_document_types`) | Table | Explicit whitelist of DocTypes and permitted actions. |

##### Child Table: `Agent Write Allowed Doctype`
- **Document Type (`document_type`):** Link to DocType (e.g. `Journal Entry`, `Sales Invoice`, `Purchase Invoice`, `Payment Entry`).
- **Allow Create (`allow_create`):** Permits preparing draft records (`docstatus = 0`).
- **Allow Update (`allow_update`):** Permits editing an existing draft record.
- **Allow Submit (`allow_submit`):** Permits posting directly to the ledger (`docstatus = 1`).
- **Allow Cancel (`allow_cancel`):** Permits cancelling submitted records (`docstatus = 2`).
- **Allow Amend (`allow_amend`):** Permits amending cancelled documents.
- **Auto-Submit Ceiling Amount (`auto_submit_ceiling_amount`):** Maximum financial total that the agent may submit automatically without interactive confirmation. Enter `0` to require human approval on every submission.

#### C. Blast Radius Limits Section
Controls the maximum exposure of any single batch run.

| Field | Default | Behavior | Recommended Setting |
|---|---|---|---|
| **Max Documents Per Run** (`max_documents_per_run`) | `0` | Maximum number of records created in a single batch. `0` = Unlimited. | `50` for batch imports. |
| **Max Total Amount Per Run** (`max_total_amount_per_run`) | `0` | Maximum cumulative currency amount recorded in a single run. `0` = Unlimited. | Set to your practice's single-batch threshold (e.g., `50,000`). |
| **Posting Date - Max Days Back** (`posting_date_max_days_back`) | `0` | Prevents backdating entries older than $N$ days. `0` = Unlimited. *(Closed accounting period freezes always apply regardless)*. | `30` to prevent modifying historical closed periods. |
| **Posting Date - Max Days Forward** (`posting_date_max_days_forward`) | `0` | **NOTE:** Unlike other fields, `0` here **strictly forbids future dating**! | Leave at `0` unless advance-dated checks/invoices are required. |

#### D. Scope Restrictions Section
- **Allowed Companies (`allowed_companies`):** In multi-company environments, whitelist the specific companies the agent is permitted to touch. Leave empty to allow all companies accessible by the agent user.
- **Blocked Accounts (`blocked_accounts`):** Whitelist of sensitive ledger accounts that the agent is **never** permitted to debit or credit under any circumstance (e.g. *Retained Earnings*, *Suspense Account*, *Statutory VAT/Tax Control Accounts*).

---

### 3. Agent Messaging Settings (Email, Telegram & Slack)
> **Route:** `/app/agent-messaging-settings` | **Type:** Single DocType | **Access:** System Manager

Enables Razyyn AI to dispatch generated financial statements, audit summaries, and alerts to team members and external stakeholders over three channels, each on its own tab.

#### Tab 1: Email (SMTP)
Sends mail through a standard SMTP mailbox — no Google Workspace admin setup required.

##### Setup:
1. In your mail provider, create or use a mailbox for the agent (e.g. `finance@yourcompany.com`) and generate an **App Password** for it if your provider requires one (Gmail, Microsoft 365, etc. all support this under the account's security settings). Use the App Password here, never the mailbox owner's personal login password.
2. In ERPNext, open **Agent Messaging Settings** → **Email** tab and fill in:

| Field | Value / Setup |
|---|---|
| **Send email from this mailbox** (`gmail_enabled`) | Check to enable outbound email. |
| **Send As** (`gmail_sender_email`) | The mailbox address the agent sends from. |
| **Sender Display Name** (`gmail_sender_name`) | Name shown in recipient inboxes (e.g. `Acme Finance Agent`). |
| **Mail Server** (`gmail_smtp_host`) | Your SMTP host (e.g. `smtp.gmail.com`, `smtp.office365.com`). |
| **Port** (`gmail_smtp_port`) | The SMTP port for your server (e.g. `587`). |
| **Security** (`gmail_smtp_security`) | `STARTTLS` (suits almost every provider, Gmail included), `SSL`, or `None` (only for a mail server inside your own network). |
| **Username** (`gmail_smtp_username`) | Usually the same as the sending mailbox address. |
| **Password / App Password** (`gmail_smtp_password`) | The App Password generated in step 1. Stored encrypted. |
| **Last Problem** (`gmail_last_error`) | Read-only diagnostic field showing the last SMTP error. |
| **Saved Recipients** (`email_destinations`) | Address book of named recipients the agent can send to by name. |

##### Saved Recipients (`Agent Email Destination`):
- **Name (`label`):** Natural name used in chat prompts (e.g. `Finance Team`, `CFO`).
- **Email Address (`email_address`):** The recipient's mailbox.
- **Default (`is_default`):** Checked for the default recipient when none is specified.
- **Notes (`notes`):** Optional free-text note.

---

#### Tab 2: Telegram
Allows Razyyn AI to post notifications and deliver Excel/PDF reports into internal Telegram groups or channels.

##### Telegram Bot Setup:
1. Open Telegram, search for **@BotFather**, and send `/newbot`.
2. Follow prompts to name your bot (e.g. `Acme Finance Bot` with username `acme_finance_bot`).
3. Copy the HTTP API token provided.
4. Create your team group or channel, and add your bot as an **Administrator** with permission to **Post Messages**.
5. Find the numeric Chat ID:
   - Send any test message in the group.
   - In a browser, open: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   - Locate `"chat":{"id": -1001234567890}`. *(Note: Group IDs are always negative; keep the minus sign!)*

##### Configuration in ERPNext:
| Field | Value / Setup |
|---|---|
| **Send messages through Telegram** (`telegram_enabled`) | Check to activate Telegram dispatching. |
| **Bot Token** (`telegram_bot_token`) | Paste the token from BotFather. Stored encrypted. |
| **Last Problem** (`telegram_last_error`) | Read-only diagnostic field showing the last Telegram API error. |
| **Destinations** (`telegram_destinations`) | Whitelist of valid chat destinations: |
| ↳ **Name** (`label`) | Natural name used in chat prompts (e.g. `Finance Team`, `CFO Alert`). |
| ↳ **Chat ID** (`chat_id`) | Numeric Telegram chat identifier (e.g. `-1001234567890`). |
| ↳ **Default** (`is_default`) | Checked for the default recipient when none is specified. |

---

#### Tab 3: Slack
Allows Razyyn AI to post notifications and deliver reports directly into Slack channels.

##### Slack App Setup:
1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) and add the `chat:write` bot scope under **OAuth & Permissions**.
2. Install the app to your workspace and copy the **Bot User OAuth Token**.
3. Invite the bot to the channel(s) it should post in (`/invite @your-bot-name`).
4. Note the Channel ID for each channel (found at the bottom of a channel's details panel in Slack).

##### Configuration in ERPNext:
| Field | Value / Setup |
|---|---|
| **Send messages through Slack** (`slack_enabled`) | Check to activate Slack dispatching. |
| **Bot Token** (`slack_bot_token`) | The Bot User OAuth Token from step 2. Stored encrypted. |
| **Last Problem** (`slack_last_error`) | Read-only diagnostic field showing the last Slack API error. |
| **Destinations** (`slack_destinations`) | Whitelist of valid channel destinations: |
| ↳ **Name** (`label`) | Natural name used in chat prompts (e.g. `Finance Team`). |
| ↳ **Channel ID** (`channel_id`) | Slack channel identifier. |
| ↳ **Default** (`is_default`) | Checked for the default channel when none is specified. |

---

### 4. ERP Role & User Permissions

Razyyn AI checks two independent layers before any write reaches your database: your ERPNext role permissions, and the **Agent Write Policy** above. A write only goes through if both allow it.

- The app provisions a dedicated system user: `accountant-agent@agent.local` with the role `Accountant Agent`.
- The `Accountant Agent` role ships with permissions strictly on app-owned metadata (`Agent Write Log`, `Agent Chats`, `Agent Chat History`).
- To allow the agent to create accounting records, simply assign appropriate ERPNext standard roles to `accountant-agent@agent.local` (such as `Accounts User` or custom restricted roles), or configure User Permissions to limit access to specific branches, cost centers, or fiscal periods.

---

## Auditability & Observability

### 1. Agent Write Log
> **Route:** `/app/agent-write-log`

An immutable, append-only ledger recording every write attempt made by Razyyn AI, including successful commits, validations, and policy rejections:
- **Idempotency Key:** Cryptographic key ensuring network retries never duplicate transactions.
- **Action:** `create`, `update`, `submit`, `cancel`, or `amend`.
- **Status:** `IN_FLIGHT`, `COMMITTED`, or `FAILED`.
- **Target Document:** DocType and Name (e.g., `Journal Entry JV-2026-00042`), plus the resulting docstatus.
- **Audit Actors:** Shows `agent_user` and the human `approved_by` who verified the transaction, linked to `session_id` and `run_id`.
- **Integrity Digest:** Hash of the exact request payload passed to the ERP.
- **Diagnostics:** Error code, error message, and response snapshot for any failed or rejected write.

### 2. Agent Message Log
> **Route:** `/app/agent-message-log`

Maintains a complete record of all outbound email, Telegram, and Slack messages dispatched by the agent:
- Channel, recipient/destination, and destination name.
- Delivery status, timestamp, and provider message ID (the receipt).
- Subject line and a truncated body preview, plus any attachment names.
- Who requested the message and who approved it, linked to the originating chat session and run.

---

## Usage Examples

Access Razyyn AI from the ERPNext desk menu or visit `/app/agent-chat`.

### 💬 General Inquiries & Accounting Guidance
> *"What is our total outstanding Accounts Receivable across all customers as of today, and who are our top 3 overdue debtors?"*

> *"Explain how we should account for software subscription revenue under IFRS 15, and draft the required journal entry pattern."*

### 📊 Financial Analysis & Visualizations
> *"Analyze our sales performance for Q1 and Q2 this year broken down by item group. Render a comparison graph and export the detailed variance analysis to an Excel file."*

> *"Calculate our current ratio, quick ratio, and debt-to-equity ratio based on our latest balance sheet, and highlight any liquidity risks."*

### 🔍 Forensic Auditing & Internal Controls
> *"Audit all general ledger journals posted in the last 30 days. Flag any round-sum transactions, entries posted outside business hours, and potential duplicate payments to suppliers."*

> *"Perform a Benford's Law analysis on our supplier payments this fiscal year. Summarize anomalies in an audit table and send the findings report to the Finance Team on Telegram."*

### ⚖️ Bank & Ledger Reconciliation
*(Attach `bank_statement_august.csv` using the paperclip or drag-and-drop)*:
> *"Reconcile this attached bank statement against our 'HDFC Bank - Current Account' ledger for August 2026. Identify all uncredited deposits, unpresented checks, and missing bank charges."*

### ✍️ Document Recording & Posting
> *"Record a payment entry of $3,500 received from customer 'Apex Global' against invoice 'SINV-2026-00120' deposited into 'Main Bank Account'. Send me the confirmation email once posted."*

> *(Razyyn AI will analyze the ledger, format the payment entry, verify invoice balance, present an interactive proposal card in chat, and prompt you to click **Approve** before saving)*.

---

## Troubleshooting & FAQs

### 1. The agent says: *"Recording is disabled"*
- **Cause:** Either recording is toggled off in `Agent Settings`, or `Agent Write Policy` is disabled.
- **Resolution:**
  1. Go to `Agent Settings` (`/app/agent-settings`) and ensure the status card shows **Ready to record**.
  2. Open `Agent Write Policy` (`/app/agent-write-policy`) and tick **Enable Agent Writes**.

### 2. The write was refused: *"Account X is blocked by policy"*
- **Cause:** The transaction attempted to debit or credit an account listed in the `Blocked Accounts` table of `Agent Write Policy` (e.g. Retained Earnings).
- **Resolution:** If this entry is legitimate, remove the account from `Blocked Accounts` or have an authorized human accountant post it manually.

### 3. Telegram error: *"chat not found"*
- **Cause:** The chat ID is missing the leading minus sign, or the bot was never invited to the group.
- **Resolution:** Verify group IDs start with `-100...` and verify the bot is an administrator in the target chat.

### 4. Email fails to send / authentication error
- **Cause:** The SMTP username/password (or App Password) is wrong, or the wrong **Security** mode was chosen for the mail server's port.
- **Resolution:** Confirm you generated an **App Password** (not the mailbox owner's personal password) if your provider requires one, and match `gmail_smtp_security` to what your provider expects for the configured port (`STARTTLS` for `587`, `SSL` for `465`). Check `gmail_last_error` in **Agent Messaging Settings** for the exact SMTP response.

### 5. Slack error: *"channel_not_found"* or *"not_in_channel"*
- **Cause:** The bot has not been invited to the target channel, or the Channel ID is wrong.
- **Resolution:** Invite the bot to the channel with `/invite @your-bot-name` and verify the Channel ID in **Agent Messaging Settings**.

---

## Security, Privacy & Compliance

- **Encrypted Credentials:** API keys, SMTP passwords, and bot tokens are stored in Frappe's encrypted `__Auth` table using Fernet encryption.
- **Append-Only Logging:** The `Agent Write Log` overrides standard deletion hooks (`on_trash`), making it impossible for users or the agent to erase audit trails.
- **Strict Tenant Isolation:** Backend databases employ Row-Level Security (RLS) ensuring strict data segregation across tenant environments.
- **No Model Training:** Customer accounting data transmitted for reasoning is strictly ephemeral and never used for LLM fine-tuning or training.
- **Compliance-aware by configuration:** The agent reasons and acts within the company policy, country regulatory rules, and accounting principles (IFRS/GAAP) you configure in [Agent Settings](#1-agent-settings) — every write is additionally bound by your ERPNext role permissions and the [Agent Write Policy](#2-agent-write-policy-guardrails-for-ledger-writes).

---

## License & Support

- **License:** Open-source under the [MIT License](license.txt).
- **Publisher:** [Razyyn AI](https://razyyn.com).
- **Repository:** [Razyyn-AI-Frappe](https://github.com/Marwan-badr543/Razyyn-AI-Frappe) (Branch: `Razyyn-AI-Frappe-v14`)
- **Website, Plans & Support:** Visit [razyyn.com](https://razyyn.com) for product documentation, pricing plans, and support channels.
