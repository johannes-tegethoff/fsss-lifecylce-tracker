---
name: App Architecture
description: Auth pattern, egress domains, storage keys, resolver structure, security controls already in place
type: project
---

## Authentication / Authorization Pattern
- Access control via `checkUserGroupAccess(req.context.accountId)` — uses Forge context accountId (correct, not user-supplied)
- Group membership verified via `api.asUser().requestJira(route/rest/api/3/user/groups?accountId=${accountId})`
- Settings-based: `restrictAccess` flag + `allowedGroups` array stored in KVS
- `handleGetSettings` and `handleSaveSettings` have NO authorization check — any authenticated Jira user can read/write settings

## Egress Domains (manifest.yml)
- backend: api.atlassian.com
- client: fonts.googleapis.com, fonts.gstatic.com

## Storage Keys (KVS)
- `app-settings` — full settings object (allowedGroups, projectKey, fieldMappings, cacheEnabled)
- `allowed-groups` — declared but not used (only `app-settings` is used in code)
- `project-key` — declared but not used
- `lifecycle-cache-{projectKey}` — cached data payload

## Resolver Functions Exposed
- getLifecycleData — has access control check
- getSettings — NO access control check
- saveSettings — NO access control check
- getAvailableFields — NO access control check
- getAvailableGroups — NO access control check
- testAssetsConnection — NO access control check
- discoverIssueFields — NO access control check (but uses asUser so Jira ACL applies)
- discoverAssetAttributes — NO access control check
- invalidateCache — NO access control check

## Known Security Controls (Positive)
- `route` template literal used everywhere for Jira API calls (prevents URL injection)
- `isValidProjectKey` + `sanitizeProjectKey` used before JQL construction
- `@forge/api` `asUser()` propagates user context for Jira permission checks
- `api.asApp()` only used as fallback in discoverAssetAttributes (discovery tool)
- Error messages to frontend are classified and generic for unknown errors
- KVS cache keys are deterministic: `lifecycle-cache-${sanitizedProjectKey}`
- No secrets or tokens hardcoded
