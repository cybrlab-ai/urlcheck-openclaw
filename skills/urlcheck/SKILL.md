---
name: urlcheck
description: Assess target URLs for potential threats and alignment with the user's browsing intent before agent navigation.
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.urlcheck-openclaw.enabled"]}}}
---

# URLCheck — Next-Step URL Assessment

You have access to a URL verification system that checks target web
resources for security threats and evaluates whether they appear to
correspond to the user's browsing goals. Use it to verify any URL **before** taking the
next step — navigating, clicking, opening, or redirecting.

The goal is not only to detect threats but to help assess whether the
target resource appears aligned with what the user actually intends to
accomplish.

## When to Verify

Verify a URL before any of these actions:

- Opening a link the user provides or that you discover
- Navigating to a page on the user's behalf
- Following a redirect chain
- Downloading a file from a URL
- Submitting credentials to a login page
- Taking any action where the destination matters to the outcome

Do not verify URLs that are internal references (localhost,
file://, or intranet addresses the user is already working with).

## Which Tool to Use

**`url_scanner_scan`** — Threat-focused verification.
- Required parameter: `url` (the URL to verify).
- Use when the user has not stated a specific purpose. The system
  evaluates the URL for phishing, malware, and suspicious patterns.

**`url_scanner_scan_with_intent`** — Threat verification plus destination-intent alignment.
- Required parameter: `url` (the URL to verify).
- Optional parameter: `intent` (the user's stated purpose).
- Use when the user has mentioned a purpose such as "log in",
  "purchase", "download", "book", or "sign up". Pass that purpose as
  the `intent` parameter so the system can evaluate whether the target
  resource appears to correspond to the user's goal, in addition
  to checking for threats.

**Prefer `url_scanner_scan_with_intent` whenever intent is available.**
This catches mismatches that threat-only analysis may miss — for
example, a legitimate site that may not be the one the user intended
to use for their goal.

## How to Act on Results

Every verification returns an `agent_access_directive`. Follow it:

- **`ALLOW`** — Proceed with navigation. Inform the user briefly that
  the URL was assessed. Do not guarantee safety.
- **`DENY`** — Do not navigate. Tell the user the URL was flagged and
  include the `agent_access_reason`. Suggest they verify the URL or
  use an alternative.
- **`RETRY_LATER`** — Verification could not complete (temporary
  issue). Wait a moment and retry once. If it fails again, inform
  the user.
- **`REQUIRE_CREDENTIALS`** — The target requires authentication. Ask
  the user how they would like to proceed before continuing.

## Interpreting Additional Fields

- `risk_score` (0.0 to 1.0): threat probability. Lower is safer.
- `confidence` (0.0 to 1.0): how certain the analysis is.
- `analysis_complete` (true/false): whether the full analysis finished.
  If false, the result is based on partial analysis — note this to the
  user when relevant.

## Timing

Verifications typically take 30 to 90 seconds. Do not set short
timeouts or abandon verification prematurely. Wait for the result
before proceeding.

## User-Facing Messaging

- Report the outcome clearly using `agent_access_directive` and
  `agent_access_reason`, and state whether the destination appears
  aligned with the user's goal when intent is provided.
- Use confidence-aware language based on scan evidence (for example,
  "appears low-risk based on this scan"); avoid absolute guarantees.
