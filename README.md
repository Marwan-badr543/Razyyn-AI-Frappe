# Razyyn AI — Accountant Agent for Frappe & ERPNext v14

[![Frappe Version](https://img.shields.io/badge/Frappe-v14-blue.svg?style=flat-square)](https://frappeframework.com)
[![ERPNext Version](https://img.shields.io/badge/ERPNext-v14-blueviolet.svg?style=flat-square)](https://erpnext.com)
[![Python Version](https://img.shields.io/badge/Python-3.10%2B-green.svg?style=flat-square)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-amber.svg?style=flat-square)](license.txt)
[![Status](https://img.shields.io/badge/Production-Ready-success.svg?style=flat-square)](#)

> **Enterprise-Grade Autonomous AI Accounting Team Embedded Natively in Frappe & ERPNext.**

Razyyn AI transforms your ERPNext instance into an intelligent financial operations hub. Rather than a simple conversational chatbot, Razyyn AI provides an autonomous **AI Manager** orchestrating specialized **accounting desks** (Q&A, In-Depth Financial Analysis, Forensic Auditing, Bank Reconciliation, and Document Creation/Posting) with strict, server-enforced internal controls and human-in-the-loop approval workflows.

---

## Table of Contents

- [Overview: What is Razyyn AI?](#overview-what-is-razyyn-ai)
- [Architecture & Specialized Desks](#architecture--specialized-desks)
  - [1. The Manager (Orchestrator)](#1-the-manager-orchestrator)
  - [2. Ask Desk (Accounting Q&A & Lookups)](#2-ask-desk-accounting-qa--lookups)
  - [3. Analyse Desk (Financial Reports & Charts)](#3-analyse-desk-financial-reports--charts)
  - [4. Audit Desk (Forensics & Internal Controls)](#4-audit-desk-forensics--internal-controls)
  - [5. Reconcile Desk (Bank & Ledger Matching)](#5-reconcile-desk-bank--ledger-matching)
  - [6. Creator Desk (Ledger Writing & ERP Recording)](#6-creator-desk-ledger-writing--erp-recording)
  - [7. Document Generator & Message Dispatcher](#7-document-generator--message-dispatcher)
- [System Architecture & Data Flow](#system-architecture--data-flow)
- [Prerequisites & System Requirements](#prerequisites--system-requirements)
- [Installation Guide](#installation-guide)
- [Zero-Credential Onboarding (Connecting Your ERP)](#zero-credential-onboarding-connecting-your-erp)
- [Comprehensive Configuration Guide](#comprehensive-configuration-guide)
  - [1. Agent Settings](#1-agent-settings)
  - [2. Agent Write Policy (Authoritative Guardrails)](#2-agent-write-policy-authoritative-guardrails)
  - [3. Agent Messaging Settings (Gmail & Telegram)](#3-agent-messaging-settings-gmail--telegram)
  - [4. ERP Role & User Permissions](#4-erp-role--user-permissions)
- [Auditability & Observability (Write Log & Message Log)](#auditability--observability-write-log--message-log)
- [Real-World Usage & Prompt Examples](#real-world-usage--prompt-examples)
- [Troubleshooting & FAQs](#troubleshooting--faqs)
- [Security, Privacy & Compliance](#security-privacy--compliance)
- [License & Support](#license--support)

---

## Overview: What is Razyyn AI?

Accounting is complex, multi-step, and high-stakes. Single-shot LLM prompts often fail when asked to reconcile accounts, detect fraudulent patterns, or post ledger entries. 

**Razyyn AI** solves this by embedding an autonomous, multi-agent financial operations team directly inside your ERPNext Desk:

- **Specialized Division of Labor:** Prompts are analyzed by a central Manager Agent that breaks complex objectives into sequential tasks dispatched to dedicated specialist desks.
- **Fail-Closed Security Posture:** The agent is provisioned out-of-the-box with zero write capabilities. All ledger mutations are bounded by your ERP user role permissions and the server-enforced **Agent Write Policy**.
- **Human-in-the-Loop Governance:** Transactions are never committed silently. The agent prepares structured proposal cards detailing debits, credits, taxes, and parties, requiring an explicit human click on **Approve** before anything is recorded.
- **Zero-Credential Onboarding:** Connecting your ERP to Razyyn AI requires no copying or pasting of API keys or secrets. Authentication is provisioned and exchanged securely over your active session in one click.
- **Rich Visualization & Deliverables:** Generates live interactive charts (Mermaid diagrams and Chart.js graphs) and exports formal deliverables in PDF, Excel (`.xlsx`), CSV, and TXT formats.
- **Omnichannel Dispatch:** Distributes reports, alerts, and files through your corporate **Gmail** (via Google Workspace service account delegation) and **Telegram** channels.

---

## Architecture & Specialized Desks

```
                                  ┌───────────────────────────┐
                                  │   User in ERPNext Desk    │
                                  │    (/app/agent-chat)      │
                                  └─────────────┬─────────────┘
                                                │ Natural Language & Files
                                                ▼
                                  ┌───────────────────────────┐
                                  │  Razyyn Manager Agent     │
                                  │ (Planner & Orchestrator)  │
                                  └─────────────┬─────────────┘
                                                │
         ┌───────────────────┬──────────────────┼──────────────────┬──────────────────┐
         │                   │                  │                  │                  │
         ▼                   ▼                  ▼                  ▼                  ▼
  ┌──────────────┐    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │   Ask Desk   │    │ Analyse Desk │   │  Audit Desk  │   │Reconcile Desk│   │ Creator Desk │
  │  (Read-Only  │    │  (Financial  │   │  (Forensics  │   │ (Bank/Ledger │   │ (Writes into │
  │  Q&A & SQL)  │    │  & Charts)   │   │  & Controls) │   │  Matching)   │   │   ERPNext)   │
  └──────────────┘    └──────────────┘   └──────────────┘   └──────────────┘   └───────┬──────┘
                                                                                       │
                                                                                       ▼
                                                                        ┌─────────────────────────────┐
                                                                        │  Agent Write Policy Gate    │
                                                                        │  & Human Approval Workflow  │
                                                                        └──────────────┬──────────────┘
                                                                                       │
                                                                                       ▼
                                                                        ┌─────────────────────────────┐
                                                                        │ ERPNext Database & Ledger   │
                                                                        │ (Journal, Invoice, Payment) │
                                                                        └─────────────────────────────┘
```

### 1. The Manager (Orchestrator)
The brain of the system. It receives natural language instructions and uploaded attachments, maintains context across conversation turns, decomposes complex user demands into prioritized task lists, briefs specialist employees, monitors their execution, and aggregates results into a clean executive summary.

### 2. Ask Desk (Accounting Q&A & Lookups)
- **Scope:** Read-only intelligence and general accounting questions.
- **Capabilities:**
  - Interprets standard accounting standards (IFRS, US GAAP, local tax regulations).
  - Performs real-time read-only lookups in your ERPNext database (chart of accounts, customer balances, stock valuation, tax rates, vendor status).
  - Reads and extracts data from uploaded documents, receipts, invoices, and contracts (PDF, DOCX, CSV, Excel, Images).
- **Restrictions:** Never writes or modifies ledger entries.

### 3. Analyse Desk (Financial Reports & Charts)
- **Scope:** Quantitative and tabular financial analysis.
- **Capabilities:**
  - Analyzes general ledgers, trial balances, sales registers, and cash flows.
  - Computes liquidity ratios, profitability margins, aging analysis, budget variances, and trend forecasts.
  - Renders interactive visual charts directly in the chat interface:
    - **Mermaid.js:** Flowcharts, entity relationships, operational pipelines.
    - **Chart.js:** Bar charts, line graphs, pie charts, revenue vs. expense comparisons.
- **Restrictions:** Does not write to ERPNext; operates strictly on provided or queried tabular data.

### 4. Audit Desk (Forensics & Internal Controls)
- **Scope:** Forensic investigation, control violation detection, and risk scoring.
- **Capabilities:**
  - Analyzes transaction populations for anomalies, unauthorized alterations, Benford's Law distribution compliance, and off-hour postings.
  - Detects duplicate vendor payments, round-number split invoices to evade approval thresholds, and unusual debit/credit combinations.
  - Produces structured audit issue tables complete with severity ratings (Critical, High, Medium, Low), financial exposure amounts, affected accounts, and actionable remediation steps.

### 5. Reconcile Desk (Bank & Ledger Matching)
- **Scope:** Autonomous multi-source matching and variance resolution.
- **Capabilities:**
  - Compares external bank statements (CSV/Excel/PDF) against the ERPNext Bank Account Ledger.
  - Reconciles subledgers against general ledger control accounts (Accounts Receivable vs. Debtor Control; Accounts Payable vs. Creditor Control).
  - Performs 3-way matching across Purchase Orders, Purchase Receipts, and Purchase Invoices.
  - Classifies unmatched items into timing differences, unrecorded bank charges, direct deposits, or data entry errors.
  - Outputs settlement proposals ready for the Creator Desk to record.

### 6. Creator Desk (Ledger Writing & ERP Recording)
- **Scope:** The **only** desk authorized to write transactions into ERPNext.
- **Capabilities:**
  - Creates draft or submitted **Journal Entries**, **Payment Entries**, **Sales Invoices**, **Purchase Invoices**, **Customers**, and **Suppliers**.
  - Performs batch document imports from formatted Excel/CSV files.
  - Supports amendment, cancellation, and revision workflows on existing records.
- **Safety Controls:**
  - **Two-Phase Commit:** Displays an interactive proposal card showing document details, accounts, debit/credit rows, taxes, and exchange rates.
  - Requires explicit human approval click in the chat before executing the write.
  - Must satisfy both the ERP user's permissions and the authoritative **Agent Write Policy**.

### 7. Document Generator & Message Dispatcher
- **Document Generator (`generate_document`):** Converts analysis, audit findings, or reconciliation results into publication-ready files (**PDF**, **Excel `.xlsx`**, **CSV**, **TXT**) provided as instant download links.
- **Message Dispatcher (`send_message`):**
  - **Gmail:** Sends formal emails and file attachments directly from your company domain (e.g. `accounts@yourcompany.com`) using secure Google Workspace domain-wide delegation.
  - **Telegram:** Sends real-time notifications, audit summaries, and file attachments to internal team groups, channels, or individual managers via a dedicated Telegram bot.

---

## System Architecture & Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor Accountant as Accountant / User
    participant Desk as ERPNext Desk UI (/app/agent-chat)
    participant FrappeApp as Frappe App (accountant_agent)
    participant Policy as Agent Write Policy
    participant Backend as Razyyn AI Agent Engine
    participant ERP as ERPNext Database

    Accountant->>Desk: "Reconcile statement.csv and create settlement entry"
    Desk->>FrappeApp: Forward message & uploaded files
    FrappeApp->>Backend: Authenticated request (Bearer JWT / API Key Hash)
    
    rect rgb(240, 245, 255)
        Note over Backend: Manager Plans Tasks: 1. Reconcile -> 2. Create Entry
        Backend->>ERP: Read Bank Ledger (Read-Only)
        Backend->>Backend: Reconcile Desk matches transactions & finds $120 bank fee
        Backend->>Backend: Creator Desk prepares Journal Entry proposal
    end

    Backend-->>Desk: Stream reconciliation summary & render Interactive Proposal Card
    Note over Accountant,Desk: User reviews proposed accounts, amounts, and dates
    Accountant->>Desk: Click "Approve"
    Desk->>FrappeApp: Execute write request with idempotency token
    
    FrappeApp->>Policy: Validate against Agent Write Policy
    alt Policy Check Failed
        Policy-->>Desk: Blocked (e.g., Blocked Account, Amount Exceeded)
    else Policy Check Passed
        Policy->>ERP: Write Document as accountant-agent@agent.local
        ERP-->>FrappeApp: Created JV-2026-00042
        FrappeApp->>FrappeApp: Record in Agent Write Log (Append-Only)
        FrappeApp-->>Desk: Render Success Badge & DocLink
    end
```

---

## Prerequisites & System Requirements

| Component | Requirement |
|---|---|
| **Frappe Framework** | Version 14.x |
| **ERPNext** | Version 14.x |
| **Python** | Python 3.10 or 3.11 |
| **Python Dependencies** | `pymupdf`, `python-docx`, `pandas`, `python-pptx`, `pillow`, `requests` (managed automatically via `pyproject.toml`) |
| **Database** | MariaDB 10.6+ or PostgreSQL 14+ |
| **Browser Support** | Modern Chrome, Firefox, Safari, Edge (Desktop & Tablet) |
| **Agent Server** | Razyyn AI Cloud API or self-hosted backend instance |

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

### Step 4: Configure the Agent Backend Server URL
Specify the address of your Razyyn AI backend server. You can configure this globally in `site_config.json`:
```bash
bench --site [your-site-name] set-config accountant_agent_server_url "http://127.0.0.1:8010"
```
*(For production, replace with your production agent domain, e.g. `https://api.razyyn.com`)*.

Alternatively, define it in `apps/accountant_agent/.env`:
```env
ACCOUNTANT_AGENT_SERVER_URL=http://127.0.0.1:8010
```

### Step 5: Build Assets & Restart Bench
Compile frontend JavaScript/CSS bundles and reload bench workers:
```bash
bench build --app accountant_agent
bench restart
```

---

## Zero-Credential Onboarding (Connecting Your ERP)

Traditional ERP integrations force administrators to generate API keys, copy passwords across applications, and risk credential leaks. Razyyn AI eliminates this with **Zero-Credential Self-Service Onboarding**.

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

## Comprehensive Configuration Guide

### 1. Agent Settings
> **Route:** `/app/agent-settings` | **Access:** System Manager

`Agent Settings` links each ERP user with their Razyyn AI platform account.

| Field Name | Type | Description & Purpose | How to Configure |
|---|---|---|---|
| **Email** (`email`) | Data | The email address registered with Razyyn AI. | Auto-populated upon sign-in from the chat interface. |
| **API Key** (`api_key`) | Password | Encrypted platform secret key authenticating requests to Razyyn. | Managed automatically by the onboarding handshake. |
| **Access Token** (`access_token`) | Password | Bearer JWT token storing active session claims. | Handled automatically during sign-in. |
| **API Key Fingerprint** (`api_key_hash`) | Data (Hidden) | SHA-256 deterministic hash of the API key used for indexed $O(1)$ database lookups. | System-generated. |
| **Custom Instructions** (`custom_instructions`) | Long Text (20,000 char max) | Custom behavioral prompt, corporate accounting rules, tax guidelines, or operational tone. | **Recommended:** Input standard operating procedures (e.g., *"Always use FIFO for inventory valuation. Default cost center is 'Main'. Treat invoices over $5,000 with high scrutiny."*). |

#### Visual Resource Usage Dashboard
The form displays an interactive live dashboard reporting:
- **Plan Tier Badge:** `Free`, `Pro`, or `Ultra`.
- **Daily Limit Usage Bar:** Percentage of your 24-hour quota consumed. Resets every 24 hours.
- **Billing Cycle Usage Bar:** 30-day cumulative consumption.
- **Refresh Stats Button:** Instantly queries the platform for updated token usage metrics.

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

### 2. Agent Write Policy (Authoritative Guardrails)
> **Route:** `/app/agent-write-policy` | **Type:** Single DocType | **Access:** System Manager

The **Agent Write Policy** is your organization's server-side safety harness. It is enforced inside your ERPNext database engine on every write attempt. Even if an AI model hallucinates or an external API is compromised, **no write violating this policy can ever be committed to the database**.

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
- **Allow Submit (`allow_submit`):** Permits posting directly to the ledger (`docstatus = 1`).
- **Allow Cancel (`allow_cancel`):** Permits cancelling submitted records (`docstatus = 2`).
- **Allow Amend (`allow_amend`):** Permits amending cancelled documents.
- **Auto-Submit Ceiling Amount (`auto_submit_ceiling_amount`):** Maximum financial total that the agent may submit automatically without interactive confirmation. Enter `0` to require human approval on every submission.

#### C. Blast Radius Limits Section
Controls the maximum damage potential in the event of automated batch runs.

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

### 3. Agent Messaging Settings (Gmail & Telegram)
> **Route:** `/app/agent-messaging-settings` | **Type:** Single DocType | **Access:** System Manager

Enables Razyyn AI to dispatch generated financial statements, audit summaries, and alerts to team members and external stakeholders.

#### Tab 1: Gmail Integration (Google Workspace Domain-Wide Delegation)
Allows the agent to send emails from your real company domain (e.g., `finance@yourcompany.com`) without storing personal user passwords.

##### Google Workspace Setup (One-Time by Workspace Admin):
1. Navigate to [Google Cloud Console](https://console.cloud.google.com) and create a project (e.g. `Razyyn Agent Mail`).
2. Enable the **Gmail API** in **APIs & Services > Library**.
3. Create a **Service Account** under **APIs & Services > Credentials** (e.g. `razyyn-mailer`).
4. In the Service Account details, go to **Keys > Add Key > Create New Key > JSON**. Download the key file.
5. Copy the **Unique ID** (Client ID) of the service account.
6. Open the [Google Workspace Admin Console](https://admin.google.com).
7. Navigate to **Security > Access and data control > API controls > Manage Domain Wide Delegation**.
8. Click **Add new**, paste the **Client ID**, and enter the single scope:
   ```
   https://www.googleapis.com/auth/gmail.send
   ```
9. Click **Authorise**.

##### Configuration in ERPNext:
| Field | Value / Setup |
|---|---|
| **Send email through Gmail** (`gmail_enabled`) | Check to enable outbound emails. |
| **Send As** (`gmail_sender_email`) | A real mailbox in your Workspace domain (e.g. `billing@yourcompany.com`). |
| **Sender Display Name** (`gmail_sender_name`) | Name shown in recipient inboxes (e.g. `Acme Finance Agent`). |
| **Service Account Key (JSON)** (`gmail_service_account_json`) | Paste the entire JSON file contents from Google Cloud. Stored encrypted. |
| **Last Problem** (`gmail_last_error`) | Read-only diagnostic field showing the last error returned by Google. |

---

#### Tab 2: Telegram Integration
Allows Razyyn AI to post notifications and deliver Excel/PDF reports into internal Telegram groups or management channels.

##### Telegram Bot Setup:
1. Open Telegram, search for **@BotFather**, and send `/newbot`.
2. Follow prompts to name your bot (e.g. `Acme Finance Bot` with username `acme_finance_bot`).
3. Copy the HTTP API token provided (e.g. `7891234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`).
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
| **Destinations Table** (`telegram_destinations`) | Whitelist of valid chat destinations: |
| ↳ **Name** (`label`) | Natural name used in chat prompts (e.g. `Finance Team`, `CFO Alert`). |
| ↳ **Chat ID** (`chat_id`) | Numeric Telegram chat identifier (e.g. `-1001234567890`). |
| ↳ **Default** (`is_default`) | Checked for the default recipient when none is specified. |

---

### 4. ERP Role & User Permissions
Razyyn AI implements a **Double-Gate Security Model**:

```
           Action Request (e.g. Create Journal Entry)
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │ Gate 1: ERPNext Role Permissions             │
        │ Does accountant-agent@agent.local have role  │
        │ permissions to create/submit this DocType?   │
        └──────────────────────┬───────────────────────┘
                               │ YES
                               ▼
        ┌──────────────────────────────────────────────┐
        │ Gate 2: Agent Write Policy                   │
        │ Is Agent Write Policy enabled? DocType       │
        │ whitelisted? Within blast radius limits?     │
        │ Account not blocked? Human approved?         │
        └──────────────────────┬───────────────────────┘
                               │ YES
                               ▼
                    [Transaction Committed]
```

- The app provisions a dedicated system user: `accountant-agent@agent.local` with the role `Accountant Agent`.
- The `Accountant Agent` role ships with permissions strictly on app-owned metadata (`Agent Write Log`, `Agent Chats`, `Agent Chat History`).
- To allow the agent to create accounting records, simply assign appropriate ERPNext standard roles to `accountant-agent@agent.local` (such as `Accounts User` or custom restricted roles), or configure User Permissions to limit access to specific branches, cost centers, or fiscal periods.

---

## Auditability & Observability

### 1. Agent Write Log
> **Route:** `/app/agent-write-log`

An immutable, append-only ledger recording every write attempt made by Razyyn AI, including successful commits, validations, and policy rejections:
- **Idempotency Key:** Cryptographic UUID ensuring network retries never duplicate transactions.
- **Action & Status:** `create`, `submit`, `cancel`, `amend` with status `written`, `rejected`, or `failed`.
- **Target Document:** DocType and Name (e.g., `Journal Entry JV-2026-00042`).
- **Audit Actors:** Shows `agent_user` and the human `approved_by` who verified the transaction.
- **Integrity Digest:** SHA-256 hash of the exact payload passed to the ERP.
- **Traceability:** Links to `session_id` and `run_id` to correlate back to the original chat conversation.

### 2. Agent Message Log
> **Route:** `/app/agent-message-log`

Maintains a complete record of all outbound emails and Telegram messages dispatched by the agent:
- Recipient email or Telegram destination label.
- Delivery status, timestamp, and provider message ID.
- Subject line and truncated body snippet (preserving communication privacy while verifying audit compliance).

---

## Real-World Usage & Prompt Examples

Access Razyyn AI from the ERPNext desk menu or visit `/app/agent-chat`.

### 💬 General Inquiries & Accounting Guidance (Ask Desk)
> *"What is our total outstanding Accounts Receivable across all customers as of today, and who are our top 3 overdue debtors?"*

> *"Explain how we should account for software subscription revenue under IFRS 15, and draft the required journal entry pattern."*

### 📊 Financial Analysis & Visualizations (Analyse Desk)
> *"Analyze our sales performance for Q1 and Q2 this year broken down by item group. Render a Chart.js comparison graph and export the detailed variance analysis to an Excel file."*

> *"Calculate our current ratio, quick ratio, and debt-to-equity ratio based on our latest balance sheet, and highlight any liquidity risks."*

### 🔍 Forensic Auditing & Internal Controls (Audit Desk)
> *"Audit all general ledger journals posted in the last 30 days. Flag any round-sum transactions, entries posted outside business hours, and potential duplicate payments to suppliers."*

> *"Perform a Benford's Law analysis on our supplier payments this fiscal year. Summarize anomalies in an audit table and send the findings report to the Finance Team on Telegram."*

### ⚖️ Bank & Ledger Reconciliation (Reconcile Desk)
*(Attach `bank_statement_august.csv` using the paperclip or drag-and-drop)*:
> *"Reconcile this attached bank statement against our 'HDFC Bank - Current Account' ledger for August 2026. Identify all uncredited deposits, unpresented checks, and missing bank charges."*

### ✍️ Document Recording & Posting (Creator Desk)
> *"Record a payment entry of $3,500 received from customer 'Apex Global' against invoice 'SINV-2026-00120' deposited into 'Main Bank Account'. Send me the confirmation email once posted."*

> *(Razyyn AI will analyze the ledger, format the payment entry, verify invoice balance, present an Interactive Proposal Card in chat, and prompt you to click **Approve** before saving)*.

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

### 4. Gmail error: *"unauthorized_client"*
- **Cause:** Step 6 of Gmail setup (Domain-Wide Delegation in Google Workspace Admin) was skipped or has an incorrect Client ID / Scope.
- **Resolution:** Re-check that the service account Unique ID is authorized in `admin.google.com` with scope `https://www.googleapis.com/auth/gmail.send`.

---

## Security, Privacy & Compliance

- **Encrypted Credentials:** API keys, service account JSON files, and bot tokens are stored in Frappe's encrypted `__Auth` table using Fernet encryption.
- **Append-Only Logging:** The `Agent Write Log` overrides standard deletion hooks (`on_trash`), making it impossible for users or the agent to erase audit trails.
- **Strict Tenant Isolation:** Backend databases employ Row-Level Security (RLS) ensuring strict data segregation across tenant environments.
- **No Model Training:** Customer accounting data transmitted for reasoning is strictly ephemeral and never used for LLM fine-tuning or training.

---

## License & Support

- **License:** Open-source under the [MIT License](license.txt).
- **Publisher:** Marwan Badr ([marwanbadr@gmail.com](mailto:marwanbadr@gmail.com)).
- **Repository:** [https://github.com/Marwan-badr543/Razyyn-AI-Frappe](https://github.com/Marwan-badr543/Razyyn-AI-Frappe) (Branch: `Razyyn-AI-Frappe-v14`)
- **Marketplace Documentation & Commercial Plans:** Visit [Razyyn AI](https://razyyn.com) for enterprise licenses, hosted cloud solutions, and SLA-backed support.
