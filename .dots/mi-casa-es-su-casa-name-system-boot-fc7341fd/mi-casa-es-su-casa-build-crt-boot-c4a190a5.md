---
title: Build CRT boot sequence screen with typing animation
status: closed
priority: 1
issue-type: task
created-at: "\"\\\"\\\\\\\"2026-02-24T23:51:28.110926-06:00\\\\\\\"\\\"\""
closed-at: "2026-02-25T00:17:26.967086-06:00"
close-reason: BootScreen.tsx implements full CRT boot sequence with typing animation (80ms per char), line-by-line rendering, scanline overlay, phosphor green glow, and phase state machine (BOOTING → NAME_PROMPT → VALIDATING → ERROR → SUCCESS). Keyframe crt-blink defined in globals.css.
---
