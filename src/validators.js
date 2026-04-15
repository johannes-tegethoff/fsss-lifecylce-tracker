import api, { route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';
import { STORAGE_KEYS, PROJECT_KEY_PATTERN } from './config.js';

export function isValidProjectKey(projectKey) {
    if (!projectKey || typeof projectKey !== 'string') return false;
    return PROJECT_KEY_PATTERN.test(projectKey);
}

export function sanitizeProjectKey(projectKey) {
    if (!projectKey || typeof projectKey !== 'string') return '';
    return projectKey.trim().toUpperCase();
}

export async function checkUserGroupAccess(accountId) {
    let settings;
    try {
        settings = await storage.get(STORAGE_KEYS.SETTINGS);
    } catch (err) {
        console.error('[checkUserGroupAccess] Error loading settings:', err);
        settings = null;
    }

    if (!settings || !settings.restrictAccess) {
        return { allowed: true, groups: [], error: null };
    }

    const allowedGroups = settings.allowedGroups || [];
    if (allowedGroups.length === 0) {
        console.warn('[checkUserGroupAccess] Access restriction enabled but no groups configured');
        return {
            allowed: false,
            groups: [],
            error: 'Access restriction is enabled but no groups are configured. Please contact your administrator.'
        };
    }

    if (!accountId) {
        return { allowed: false, groups: [], error: 'User account ID not available' };
    }

    try {
        const response = await api.asUser().requestJira(
            route`/rest/api/3/user/groups?accountId=${accountId}`
        );

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 403) return { allowed: false, groups: [], error: 'Insufficient permissions to check group membership' };
            if (response.status === 404) return { allowed: false, groups: [], error: 'User not found' };
            return { allowed: false, groups: [], error: `Failed to check groups: ${response.status}` };
        }

        const userGroups = await response.json();
        const userGroupNames = userGroups.map(g => g.name);
        const matchingGroups = userGroupNames.filter(g => allowedGroups.includes(g));
        const isAllowed = matchingGroups.length > 0;

        console.log(`[checkUserGroupAccess] Access ${isAllowed ? 'GRANTED' : 'DENIED'} for ${accountId}`);
        return {
            allowed: isAllowed,
            groups: userGroupNames,
            matchingGroups,
            allowedGroups,
            error: isAllowed ? null : 'User is not a member of any authorized group'
        };
    } catch (error) {
        console.error('[checkUserGroupAccess] Exception:', error);
        return { allowed: false, groups: [], error: 'Failed to verify group membership. Please try again.' };
    }
}
