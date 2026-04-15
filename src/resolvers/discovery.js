import api, { route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../config.js';
import { clearCache } from '../cache.js';

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]{0,9}-\d{1,6}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^\d{1,12}$/;

export async function handleDiscoverIssueFields(req) {
    const { issueKey } = req.payload || {};
    if (!issueKey || typeof issueKey !== 'string') return { error: 'issueKey is required' };
    const sanitizedIssueKey = issueKey.trim().toUpperCase();
    if (!ISSUE_KEY_PATTERN.test(sanitizedIssueKey)) {
        return { error: 'Invalid issue key format. Expected format: PROJECT-123' };
    }

    console.log(`[discoverIssueFields] Fetching all fields for ${sanitizedIssueKey}`);

    try {
        // Build field id → name/type map
        const fieldDefsResponse = await api.asUser().requestJira(route`/rest/api/3/field`);
        const fieldDefs = await fieldDefsResponse.json();
        const fieldMap = {};
        if (Array.isArray(fieldDefs)) {
            fieldDefs.forEach(f => {
                fieldMap[f.id] = { name: f.name, type: f.schema?.type, customType: f.schema?.custom };
            });
        }

        // Fetch issue with all fields
        const issueResponse = await api.asUser().requestJira(
            route`/rest/api/3/issue/${sanitizedIssueKey}?fields=*all&expand=names,renderedFields`
        );
        if (!issueResponse.ok) {
            if (issueResponse.status === 404) return { error: `Issue "${sanitizedIssueKey}" not found.` };
            if (issueResponse.status === 403) return { error: 'You do not have permission to access this issue.' };
            return { error: `Failed to fetch issue (HTTP ${issueResponse.status}).` };
        }

        const issue = await issueResponse.json();
        const rawFields = issue.fields || {};

        // Collect non-empty fields with display-friendly values
        const discovered = [];
        for (const [fieldId, value] of Object.entries(rawFields)) {
            if (value === null || value === undefined) continue;
            if (Array.isArray(value) && value.length === 0) continue;
            if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;

            const defn = fieldMap[fieldId] || {};
            let displayValue;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                displayValue = String(value);
            } else if (Array.isArray(value)) {
                displayValue = value.map(v => (typeof v === 'object' ? (v.name || v.value || v.key || JSON.stringify(v)) : String(v))).join(', ');
            } else if (typeof value === 'object') {
                displayValue = value.name || value.value || value.displayName || value.key || value.emailAddress || JSON.stringify(value).slice(0, 120);
            } else {
                displayValue = JSON.stringify(value).slice(0, 120);
            }

            discovered.push({
                id: fieldId,
                name: defn.name || issue.names?.[fieldId] || fieldId,
                type: defn.type || 'unknown',
                customType: defn.customType || null,
                isCustom: fieldId.startsWith('customfield_'),
                displayValue
            });
        }

        discovered.sort((a, b) => {
            if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        // Extract Asset refs from cmdb-object fields
        const assetRefs = [];
        for (const entry of discovered) {
            if (!entry.customType?.includes('cmdb-object')) continue;
            try {
                const parsed = JSON.parse(entry.displayValue);
                if (parsed?.workspaceId && parsed?.objectId) {
                    assetRefs.push({ fieldId: entry.id, fieldName: entry.name, workspaceId: parsed.workspaceId, objectId: parsed.objectId });
                }
            } catch {
                // displayValue is not a JSON array — skip
            }
        }

        console.log(`[discoverIssueFields] ${sanitizedIssueKey}: ${discovered.length} fields, ${assetRefs.length} asset refs`);
        return { issueKey: sanitizedIssueKey, summary: rawFields.summary || '', issueType: rawFields.issuetype?.name || '', fields: discovered, assetRefs };

    } catch (error) {
        console.error('[discoverIssueFields] Error:', error);
        return { error: 'An unexpected error occurred while fetching issue fields.' };
    }
}

export async function handleDiscoverAssetAttributes(req) {
    const { workspaceId, objectId } = req.payload || {};
    if (!workspaceId || !objectId) return { error: 'workspaceId and objectId are required' };
    if (!UUID_PATTERN.test(workspaceId)) return { error: 'Invalid workspaceId format.' };
    if (!OBJECT_ID_PATTERN.test(String(objectId))) return { error: 'Invalid objectId format.' };

    const cloudId = req.context.cloudId;

    const tryFetch = async (label, fn) => {
        try {
            const res = await fn();
            console.log(`[discoverAssetAttributes] ${label}: HTTP ${res.status}`);
            return res;
        } catch (e) {
            console.warn(`[discoverAssetAttributes] ${label} threw: ${e.message}`);
            return null;
        }
    };

    try {
        let attrResponse = await tryFetch(
            `/ex/jira/${cloudId}/jsm/assets attributes`,
            () => api.asUser().requestJira(route`/gateway/api/ex/jira/${cloudId}/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}/attributes`)
        );

        if (!attrResponse?.ok) {
            attrResponse = await tryFetch(
                `gateway /object/${objectId}/attributes (asUser)`,
                () => api.asUser().requestJira(route`/gateway/api/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}/attributes`)
            );
        }

        if (!attrResponse?.ok) {
            attrResponse = await tryFetch(
                `gateway /object/${objectId}/attributes (asApp)`,
                () => api.asApp().requestJira(route`/gateway/api/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}/attributes`)
            );
        }

        // Strategy 4: Full HTTPS URL — the actual Atlassian API endpoint.
        // The gateway paths above are Forge-internal shortcuts; the real URL is
        // https://api.atlassian.com/ex/jira/{cloudId}/jsm/assets/...
        // api.atlassian.com is allow-listed in manifest.yml under external.fetch.backend.
        if (!attrResponse?.ok) {
            attrResponse = await tryFetch(
                `full HTTPS URL asUser`,
                () => api.asUser().requestJira(route`https://api.atlassian.com/ex/jira/${cloudId}/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}/attributes`)
            );
        }

        if (!attrResponse?.ok) {
            attrResponse = await tryFetch(
                `full HTTPS URL asApp`,
                () => api.asApp().requestJira(route`https://api.atlassian.com/ex/jira/${cloudId}/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}/attributes`)
            );
        }

        if (!attrResponse?.ok) {
            const status = attrResponse?.status;
            if (status === 403) return { error: 'Access denied: insufficient permissions to read this asset.' };
            if (status === 404) return { error: 'Asset not found.' };
            console.error(`[discoverAssetAttributes] All strategies failed. Last status: ${status}`);
            return { error: 'Could not retrieve asset attributes.' };
        }

        const rawAttrs = await attrResponse.json();
        const attrList = Array.isArray(rawAttrs) ? rawAttrs : (rawAttrs.values || rawAttrs.attributes || []);

        const attributes = attrList.map(attr => ({
            id: attr.objectTypeAttributeId || attr.id,
            name: attr.objectTypeAttribute?.name || attr.name || `attr_${attr.objectTypeAttributeId}`,
            type: attr.objectTypeAttribute?.defaultType?.name || attr.type || 'unknown',
            value: (attr.objectAttributeValues || []).map(v => v.displayValue || v.value || '').filter(Boolean).join(', ') || '—'
        }));

        console.log(`[discoverAssetAttributes] ${objectId}: ${attributes.length} attributes`);
        return { objectId, objectKey: objectId, label: objectId, objectType: 'Asset', attributes };

    } catch (error) {
        console.error('[discoverAssetAttributes] Error:', error);
        return { error: 'An unexpected error occurred while fetching asset attributes.' };
    }
}

export async function handleInvalidateCache(req) {
    try {
        const settings = await storage.get(STORAGE_KEYS.SETTINGS);
        const projectKey = settings?.projectKey || DEFAULT_SETTINGS.projectKey;
        const cacheKey = `${STORAGE_KEYS.LIFECYCLE_CACHE}-${projectKey}`;
        await clearCache(cacheKey);
        return { success: true, message: 'Cache invalidated successfully' };
    } catch (error) {
        console.error('[invalidateCache] Error:', error);
        return { error: 'An unexpected error occurred while invalidating the cache.' };
    }
}
