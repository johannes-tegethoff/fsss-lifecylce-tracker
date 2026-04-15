---
name: Audit Findings Phase 3
description: All findings from the first full security audit on 2026-04-15 (branch feature/phase3-real-asset-data)
type: project
---

Audit date: 2026-04-15
Branch: feature/phase3-real-asset-data
Severity summary: 0 CRITICAL, 2 HIGH, 5 MEDIUM, 3 LOW, 2 INFO

## HIGH

H1 — Missing Authorization on Admin Resolvers (saveSettings, getSettings, getAvailableGroups, getAvailableFields, testAssetsConnection, invalidateCache, discoverIssueFields, discoverAssetAttributes)
- Any authenticated Jira user can call these resolvers (not just admins)
- Admin page is jira:adminPage but resolver function is shared — no server-side admin check
- Fix: add isJiraAdmin() check at top of each admin resolver

H2 — asApp() Fallback in discoverAssetAttributes Bypasses User Permission Check
- src/resolvers/discovery.js lines 123-145 uses api.asApp() as fallback
- Could allow a non-privileged user to read Asset attributes they cannot access as themselves
- Fix: remove asApp() fallbacks; return clear error if asUser() fails

## MEDIUM

M1 — issueKey Input Not Validated in discoverIssueFields (src/resolvers/discovery.js line 8)
- Accepts any string as issueKey, no format validation
- Mitigated by route template and Jira ACL, but adds unnecessary attack surface
- Fix: validate with /^[A-Z][A-Z0-9]+-\d+$/ before use

M2 — workspaceId / objectId Not Validated in discoverAssetAttributes (src/resolvers/discovery.js line 93)
- No format validation on workspaceId (UUID) or objectId (numeric string)
- Used directly in route templates; route() provides injection protection but allows unexpected inputs
- Fix: validate UUID format for workspaceId, numeric for objectId

M3 — handleSaveSettings Accepts Arbitrary fieldMappings Object (src/resolvers/settings.js line 44)
- fieldMappings object stored as-is without key or value validation
- Could store arbitrary keys/values in KVS settings
- Fix: whitelist allowed field mapping keys; validate values match customfield_\d+ pattern

M4 — Project Key Hardcoded in Frontend (static/hello-world/src/hooks/useLifecycleData.js line 27)
- invoke('getLifecycleData', { projectKey: 'FSSS' }) — hardcoded FSSS
- Ignores admin-configured project key; backend correctly falls back to configured key but UX is confusing
- Not a security issue per se but indicates frontend bypasses configuration

M5 — errorDetails Field Potentially Leaks Internal State (src/resolvers/lifecycle.js line 118 return)
- error.message may contain internal API error details in specific error paths
- The generic catch re-maps known patterns to safe messages but unrecognized errors still return error.message
- Fix: in the final catch, always return a generic message; log detailed error server-side only

## LOW

L1 — Google Fonts Loaded via external.fetch.client (manifest.yml lines 39-41)
- fonts.googleapis.com and fonts.gstatic.com in client egress
- Privacy: user IP sent to Google on every page load
- Fix: self-host fonts or document and accept the privacy trade-off

L2 — Cache Key Derived from User-Supplied (but Validated) projectKey (src/resolvers/lifecycle.js line 46)
- Cache key: `lifecycle-cache-${projectKey}` where projectKey comes from payload
- projectKey IS validated by isValidProjectKey before this point — low residual risk
- Fix: use only the server-side configured key, ignore payload projectKey entirely

L3 — Console Logging of accountId in Access Control Path (src/validators.js line 59)
- `[checkUserGroupAccess] Access GRANTED/DENIED for ${accountId}` logged to console
- In Forge, console logs go to structured logging accessible to app operators — acceptable but note for data minimization
- Fix: log only a hashed/truncated accountId if log verbosity is a concern

## INFO

I1 — Developer Tools (discoverIssueFields, discoverAssetAttributes) Left in Production Build
- KeyDataView.jsx includes an always-visible "Developer Tools" section
- Allows any app user to enumerate all custom fields of any Jira issue they can access
- Consider gating behind an admin check or removing from production build

I2 — react@16 Used (EOL)
- static/hello-world/package.json: "react": "^16"
- React 16 is end-of-life; no security patches since 2022
- Fix: upgrade to React 18; note Atlaskit components may need updates
