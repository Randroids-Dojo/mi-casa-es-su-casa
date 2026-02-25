---
title: Implement server-side name validation + blocklist check
status: closed
priority: 1
issue-type: task
created-at: "\"\\\"2026-02-24T23:51:28.121456-06:00\\\"\""
closed-at: "2026-02-25T00:17:56.938163-06:00"
close-reason: Server-side validation implemented in src/app/api/validate-name/route.ts — POST endpoint re-validates format, normalizes to lowercase, checks against blocklist (exact + substring match). Blocklist from NAME_BLOCKLIST env var (comma-separated) or hardcoded default of 10 reserved/offensive terms. Returns { valid, normalizedName?, error? }.
---
