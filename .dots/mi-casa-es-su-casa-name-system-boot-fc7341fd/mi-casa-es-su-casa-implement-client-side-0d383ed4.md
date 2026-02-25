---
title: Implement client-side name validation
status: closed
priority: 1
issue-type: task
created-at: "\"\\\"2026-02-24T23:51:28.118004-06:00\\\"\""
closed-at: "2026-02-25T00:17:49.575747-06:00"
close-reason: "Client-side validation implemented in src/lib/nameValidation.ts — validateNameFormat() checks: empty, length 2-20, allowed chars A-Z/a-z/0-9/-/_, no leading/trailing -/_. normalizeName() trims and lowercases. Called in BootScreen.tsx handleSubmit() before server call for instant feedback."
---
