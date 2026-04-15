---
name: Lifecycle Tracker Project Context
description: Core project context for the Siemens Energy FSSS Lifecycle Tracker Forge app — purpose, platform, and current design state
type: project
---

This is a "Service Lifecycle Tracker" for Siemens Energy FSSS, running as an Atlassian Forge Custom UI app embedded in JSM (Jira Service Management).

**Why:** Tracks the lifecycle of service units (turbines/assets) through Offer and Order pipeline stages, integrated with JSM Assets API for real asset metadata (Phase 3 as of April 2025).

**How to apply:** All UI recommendations must account for Forge Custom UI constraints (sandboxed iframe, no Atlaskit native component library, custom CSS only). The app is a full-page JSM global page, not a narrow sidebar panel.

## Key Architecture
- Platform: Forge Custom UI (React + custom CSS — not UI Kit 2 or Atlaskit components)
- 3 views: Pipeline (accordion list of customers → units → stages), Timeline (Gantt), Key Data (table)
- Data model: Customers → Units → Pipeline Stages (Offer, Offer Epic, Order, Order Epic)
- Uses CSS custom properties (design tokens) in App.css :root
- Hardcoded hex colors (not ADS semantic tokens) — dark mode not supported

## Current Design Approach
- Custom CSS with Atlassian-inspired color palette (hardcoded, not ADS tokens)
- Gradient fills on pipeline stage cards (yellow/orange/green/blue) — white text on colored backgrounds
- Emoji icons throughout (🏢 📦 📅 🔒 etc.) — not using any icon library consistently
- Material Icons loaded via Google Fonts CDN (CSP-restricted, loaded via link tag)
- Filter bar: search input + 4 select dropdowns + refresh button in a flex row
- Customer accordion with inline summary progress bar and completion %
