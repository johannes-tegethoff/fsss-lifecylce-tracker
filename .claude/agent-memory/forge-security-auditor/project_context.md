---
name: Project Context
description: Core facts about the Lifecycle Tracker Forge app — purpose, team, deployment context
type: project
---

Service Lifecycle Tracker for Siemens Energy FSSS team. Forge Custom UI app deployed on Jira (JSM).

**Why:** Tracks the lifecycle pipeline (Offer → Offer Epic → Order → Order Epic) for turbine/generator service units, grouped by customer. Integrates with JSM Assets API for Customer and Unit asset data.

**How to apply:** Authorization checks and scope analysis must account for the JSM Assets API (cmdb scopes), not just standard Jira. The app is intended for internal Siemens Energy use; exposure of internal asset/customer data is the primary data risk.

Key facts:
- Branch: feature/phase3-real-asset-data (first audit 2026-04-15)
- Runtime: nodejs24.x, arm64, 512 MB
- App ID: ari:cloud:ecosystem::app/4779b8c2-238b-4c6f-8b46-073e33ad45f5
- Project key hardcoded in frontend: 'FSSS' (useLifecycleData.js line 27)
- Admin page: jira:adminPage (separate resource, same resolver function)
- Google Fonts loaded client-side via manifest external.fetch.client
