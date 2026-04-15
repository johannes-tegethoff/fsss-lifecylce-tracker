import api, { route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';
import { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_FIELD_MAPPINGS } from '../config.js';
import { clearCache } from '../cache.js';
import { isValidProjectKey, sanitizeProjectKey } from '../validators.js';
import { processApiResponse } from '../api/jira.js';
import { getFieldMappings } from '../data/lifecycle.js';

const ALLOWED_FIELD_KEYS = new Set([
    'stopOfUnit', 'overhaulStart', 'overhaulEnd', 'startOfCommissioning',
    'team', 'customerAsset', 'unitAsset', 'servicenumber', 'offerType',
    'outageType', 'region', 'language', 'ltp', 'organizations', 'parallelWorks'
]);
const FIELD_ID_PATTERN = /^(customfield_\d+|duedate|created|updated)$/;

function validateFieldMappings(mappings) {
    if (typeof mappings !== 'object' || mappings === null || Array.isArray(mappings)) return false;
    for (const [key, value] of Object.entries(mappings)) {
        if (!ALLOWED_FIELD_KEYS.has(key)) return false;
        if (typeof value !== 'string' || !FIELD_ID_PATTERN.test(value)) return false;
    }
    return true;
}

export async function handleGetSettings(req) {
    try {
        const settings = await storage.get(STORAGE_KEYS.SETTINGS);
        return settings || DEFAULT_SETTINGS;
    } catch (error) {
        console.error('[getSettings] Error:', error);
        return { error: 'Failed to load settings.', ...DEFAULT_SETTINGS };
    }
}

export async function handleSaveSettings(req) {
    try {
        const { settings } = req.payload;
        if (!settings || typeof settings !== 'object') {
            return { error: 'Invalid settings format' };
        }

        if (settings.projectKey) {
            const sanitizedKey = sanitizeProjectKey(settings.projectKey);
            if (!isValidProjectKey(sanitizedKey)) {
                return { error: `Invalid project key format: "${settings.projectKey}"` };
            }
            settings.projectKey = sanitizedKey;
        }

        if (settings.allowedGroups && !Array.isArray(settings.allowedGroups)) {
            return { error: 'allowedGroups must be an array' };
        }

        if (settings.allowedGroups) {
            settings.allowedGroups = settings.allowedGroups
                .map(g => (typeof g === 'string' ? g.trim() : ''))
                .filter(g => g.length > 0);
        }

        let fieldMappings = settings.fieldMappings;
        if (fieldMappings !== undefined) {
            if (!validateFieldMappings(fieldMappings)) {
                return { error: 'Invalid field mappings: keys or values have an invalid format.' };
            }
        } else {
            const existing = await storage.get(STORAGE_KEYS.SETTINGS);
            fieldMappings = existing?.fieldMappings || DEFAULT_FIELD_MAPPINGS;
        }

        const finalSettings = {
            allowedGroups: settings.allowedGroups || DEFAULT_SETTINGS.allowedGroups,
            restrictAccess: Boolean(settings.restrictAccess),
            projectKey: settings.projectKey || DEFAULT_SETTINGS.projectKey,
            fieldMappings,
            cacheEnabled: settings.cacheEnabled !== false,
            updatedAt: new Date().toISOString()
        };

        await storage.set(STORAGE_KEYS.SETTINGS, finalSettings);

        const cacheKey = `${STORAGE_KEYS.LIFECYCLE_CACHE}-${finalSettings.projectKey}`;
        await clearCache(cacheKey);

        return { success: true, settings: finalSettings };
    } catch (error) {
        console.error('[saveSettings] Error:', error);
        return { error: 'Failed to save settings.' };
    }
}

export async function handleGetAvailableFields(req) {
    try {
        const response = await api.asUser().requestJira(route`/rest/api/3/field`);
        const result = await processApiResponse(response, 'Fetch fields');
        if (!result.ok) return { error: result.error, fields: [] };

        const fields = result.data
            .filter(f => f.custom || f.id.startsWith('customfield_'))
            .map(f => ({
                id: f.id,
                name: f.name,
                type: f.schema?.type || 'unknown',
                customType: f.schema?.custom || null,
                description: f.description || null
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const standardDateFields = [
            { id: 'duedate', name: 'Due Date', type: 'date', customType: null },
            { id: 'created', name: 'Created', type: 'datetime', customType: null },
            { id: 'updated', name: 'Updated', type: 'datetime', customType: null }
        ];

        return {
            fields,
            dateFields: [...standardDateFields, ...fields.filter(f => f.type === 'date' || f.type === 'datetime' || f.customType?.includes('date'))],
            selectFields: fields.filter(f => f.type === 'option' || f.customType?.includes('select') || f.customType?.includes('radio')),
            teamFields: fields.filter(f => f.name.toLowerCase().includes('team') || f.type === 'option' || f.customType?.includes('select')),
            total: fields.length
        };
    } catch (error) {
        console.error('[getAvailableFields] Error:', error);
        return { error: 'Failed to load available fields.', fields: [] };
    }
}

export async function handleGetAvailableGroups(req) {
    try {
        const response = await api.asUser().requestJira(route`/rest/api/3/groups/picker?maxResults=50`);
        const result = await processApiResponse(response, 'Fetch groups');
        if (!result.ok) return { error: result.error, groups: [] };

        const groups = (result.data.groups || []).map(g => ({ name: g.name, html: g.html || g.name }));
        return { groups };
    } catch (error) {
        console.error('[getAvailableGroups] Error:', error);
        return { error: 'Failed to load available groups.', groups: [] };
    }
}

export async function handleTestAssetsConnection(req) {
    const diagnostics = {
        timestamp: new Date().toISOString(),
        workspaceId: null,
        cloudId: req.context.cloudId,
        errors: []
    };

    try {
        const wsResponse = await api.asUser().requestJira(route`/rest/servicedeskapi/assets/workspace`);
        if (wsResponse.ok) {
            const wsData = await wsResponse.json();
            diagnostics.workspaceId = wsData.values?.[0]?.workspaceId || null;
        } else {
            diagnostics.errors.push(`Workspace endpoint returned ${wsResponse.status}`);
        }

        const settings = await storage.get(STORAGE_KEYS.SETTINGS).catch(() => null);
        const fieldMappings = getFieldMappings(settings);
        diagnostics.configuredFields = {
            customerAssetField: fieldMappings.assetFields.customerAsset,
            unitAssetField: fieldMappings.assetFields.unitAsset
        };

        return diagnostics;
    } catch (error) {
        console.error('[testAssetsConnection] Error:', error);
        diagnostics.errors.push('An unexpected error occurred during the connection test.');
        return diagnostics;
    }
}
