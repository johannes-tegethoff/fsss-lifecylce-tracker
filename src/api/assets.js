import api, { route } from '@forge/api';

/**
 * Parses a raw JSM Asset API response into a simplified flat structure.
 * Extracts all objectTypeAttribute names as keys in an attributes map.
 */
export function parseAssetResponse(asset) {
    if (!asset) return null;

    const attributes = {};
    for (const attr of (asset.attributes || [])) {
        const attrName = attr.objectTypeAttribute?.name || `attr_${attr.objectTypeAttributeId}`;
        const values = (attr.objectAttributeValues || []).map(v => {
            if (v.referencedObject) {
                return {
                    displayValue: v.displayValue,
                    referencedObject: {
                        id: v.referencedObject.id,
                        objectKey: v.referencedObject.objectKey,
                        label: v.referencedObject.label
                    }
                };
            }
            return v.displayValue || v.value;
        });
        attributes[attrName] = values.length === 1 ? values[0] : values;
    }

    return {
        id: asset.id,
        objectKey: asset.objectKey,
        label: asset.label || asset.name,
        objectType: asset.objectType?.name,
        workspaceId: asset.workspaceId,
        created: asset.created,
        updated: asset.updated,
        attributes
    };
}

/**
 * Extracts Customer and Unit Asset references from an issue's custom fields.
 * Handles the three formats Jira can return for cmdb-object fields:
 *   - Array of objects (most common)
 *   - Single object
 *   - String (key or name)
 */
export function extractAssetReferences(issue, assetFields) {
    const fields = issue.fields || {};

    function normalizeAssetField(fieldValue, defaultType) {
        if (!fieldValue) return null;

        if (Array.isArray(fieldValue)) {
            if (fieldValue.length === 0) return null;
            fieldValue = fieldValue[0];
        }

        if (typeof fieldValue === 'string') {
            return {
                id: null,
                objectKey: fieldValue.includes('-') ? fieldValue : null,
                label: fieldValue,
                workspaceId: null,
                objectType: defaultType
            };
        }

        if (typeof fieldValue === 'object') {
            return {
                id: fieldValue.objectId || fieldValue.id || null,
                objectKey: fieldValue.objectKey || fieldValue.key || null,
                label: fieldValue.label || fieldValue.name || fieldValue.displayName || fieldValue.title || null,
                workspaceId: fieldValue.workspaceId || null,
                objectType: fieldValue.objectType?.name || fieldValue.typeName || defaultType
            };
        }

        return null;
    }

    return {
        customer: normalizeAssetField(fields[assetFields.customerAsset], 'Customer'),
        unit: normalizeAssetField(fields[assetFields.unitAsset], 'Unit')
    };
}

/**
 * Fetches a single JSM Asset object by numeric objectId.
 * Tries the full HTTPS URL first (correct base URL for Assets API),
 * then falls back to the Forge gateway shorthand.
 * Errors are logged at debug level — callers should expect null and use summary fallback.
 */
export async function fetchAssetById(workspaceId, objectId, cloudId) {
    if (!workspaceId || !objectId) return null;

    const tryFetch = async (fn) => {
        try {
            const res = await fn();
            if (res.ok) return res;
            console.debug(`[fetchAssetById] ${objectId}: HTTP ${res.status}`);
            return null;
        } catch (e) {
            console.debug(`[fetchAssetById] ${objectId}: ${e.message}`);
            return null;
        }
    };

    let response = null;

    if (cloudId) {
        response = await tryFetch(() =>
            api.asUser().requestJira(route`https://api.atlassian.com/ex/jira/${cloudId}/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}`)
        );
    }

    if (!response) {
        response = await tryFetch(() =>
            api.asUser().requestJira(route`/gateway/api/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}`)
        );
    }

    if (!response) return null;
    return parseAssetResponse(await response.json());
}

/**
 * Fetches multiple Assets in parallel batches.
 * Returns a Map of objectId → parsed asset (only successful fetches).
 */
export async function fetchAssetsInBatches(refs, cloudId, batchSize = 10) {
    const results = new Map();
    for (let i = 0; i < refs.length; i += batchSize) {
        const batch = refs.slice(i, i + batchSize);
        const settled = await Promise.all(
            batch.map(({ workspaceId, objectId }) =>
                fetchAssetById(workspaceId, objectId, cloudId).then(asset => ({ objectId, asset }))
            )
        );
        for (const { objectId, asset } of settled) {
            if (asset) results.set(objectId, asset);
        }
    }
    console.log(`[fetchAssetsInBatches] Resolved ${results.size}/${refs.length} assets`);
    return results;
}
