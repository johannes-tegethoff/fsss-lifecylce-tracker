import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { storage } from '@forge/kvs';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Storage Keys for Forge Key-Value Storage
 * These keys are used to persist app configuration.
 */
const STORAGE_KEYS = {
    SETTINGS: 'app-settings',
    ALLOWED_GROUPS: 'allowed-groups',
    PROJECT_KEY: 'project-key'
};

/**
 * Default settings used when no configuration exists yet.
 * These are fallback values for first-time app usage.
 */
const DEFAULT_SETTINGS = {
    allowedGroups: [],
    restrictAccess: false,
    projectKey: 'FSSS'
};

/**
 * Maximum number of parallel API requests.
 * Prevents overwhelming the Jira API and hitting rate limits.
 */
const MAX_PARALLEL_REQUESTS = 10;

/**
 * Regex pattern for valid Jira project keys.
 * Must start with uppercase letter, followed by 1-9 uppercase letters/numbers.
 */
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/

const resolver = new Resolver();

// ============================================================================
// VALIDATION & SECURITY UTILITIES
// ============================================================================

/**
 * Validates a Jira project key format.
 * Project keys must be uppercase alphanumeric, starting with a letter.
 * 
 * @param {string} projectKey - The project key to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidProjectKey(projectKey) {
    if (!projectKey || typeof projectKey !== 'string') {
        return false;
    }
    return PROJECT_KEY_PATTERN.test(projectKey);
}

/**
 * Sanitizes a project key by converting to uppercase and trimming.
 * Does NOT validate - call isValidProjectKey separately.
 * 
 * @param {string} projectKey - The project key to sanitize
 * @returns {string} Sanitized project key
 */
function sanitizeProjectKey(projectKey) {
    if (!projectKey || typeof projectKey !== 'string') {
        return '';
    }
    return projectKey.trim().toUpperCase();
}

/**
 * Checks if the current user is a member of any allowed group.
 * Uses the Jira REST API to check group membership.
 * 
 * @param {string} accountId - The user's Atlassian account ID
 * @returns {Promise<{allowed: boolean, groups: string[], error: string|null}>}
 */
async function checkUserGroupAccess(accountId) {
    // Load settings from storage to check if access restriction is enabled
    let settings;
    try {
        settings = await storage.get(STORAGE_KEYS.SETTINGS);
    } catch (err) {
        console.error('[checkUserGroupAccess] Error loading settings:', err);
        settings = null;
    }
    
    // If no settings or restriction disabled, allow all users
    if (!settings || !settings.restrictAccess) {
        console.log('[checkUserGroupAccess] Access restriction disabled, allowing access');
        return { allowed: true, groups: [], error: null };
    }
    
    const allowedGroups = settings.allowedGroups || [];
    
    // If restriction enabled but no groups configured, deny access (safety)
    if (allowedGroups.length === 0) {
        console.warn('[checkUserGroupAccess] Access restriction enabled but no groups configured!');
        return { 
            allowed: false, 
            groups: [], 
            error: 'Access restriction is enabled but no groups are configured. Please contact your administrator.' 
        };
    }
    
    if (!accountId) {
        console.error('[checkUserGroupAccess] No accountId provided');
        return { allowed: false, groups: [], error: 'User account ID not available' };
    }
    
    try {
        console.log(`[checkUserGroupAccess] Checking groups for user: ${accountId}`);
        
        // Fetch user's group memberships
        const response = await api.asUser().requestJira(
            route`/rest/api/3/user/groups?accountId=${accountId}`
        );
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[checkUserGroupAccess] API error: ${response.status} - ${errorText}`);
            
            // Handle specific error codes
            if (response.status === 403) {
                return { allowed: false, groups: [], error: 'Insufficient permissions to check group membership' };
            }
            if (response.status === 404) {
                return { allowed: false, groups: [], error: 'User not found' };
            }
            return { allowed: false, groups: [], error: `Failed to check groups: ${response.status}` };
        }
        
        const userGroups = await response.json();
        const userGroupNames = userGroups.map(g => g.name);
        
        console.log(`[checkUserGroupAccess] User groups: ${userGroupNames.join(', ')}`);
        
        // Check if user is in any allowed group
        const matchingGroups = userGroupNames.filter(g => allowedGroups.includes(g));
        const isAllowed = matchingGroups.length > 0;
        
        console.log(`[checkUserGroupAccess] Access ${isAllowed ? 'GRANTED' : 'DENIED'} - Matching groups: ${matchingGroups.join(', ')}`);
        
        return {
            allowed: isAllowed,
            groups: userGroupNames,
            matchingGroups,
            allowedGroups,
            error: isAllowed ? null : 'User is not a member of any authorized group'
        };
    } catch (error) {
        console.error('[checkUserGroupAccess] Exception:', error);
        return { allowed: false, groups: [], error: `Group check failed: ${error.message}` };
    }
}

/**
 * Processes a Jira API response and returns a standardized result.
 * Handles common HTTP status codes with user-friendly messages.
 * 
 * @param {Response} response - Fetch API response object
 * @param {string} context - Description of the operation for error messages
 * @returns {Promise<{ok: boolean, data: any, error: string|null, status: number}>}
 */
async function processApiResponse(response, context = 'API request') {
    const status = response.status;
    
    if (response.ok) {
        try {
            const data = await response.json();
            return { ok: true, data, error: null, status };
        } catch (parseError) {
            // Some successful responses may not have JSON body
            return { ok: true, data: null, error: null, status };
        }
    }
    
    // Handle error responses
    let errorMessage;
    try {
        const errorBody = await response.json();
        errorMessage = errorBody.message || errorBody.errorMessages?.[0] || JSON.stringify(errorBody);
    } catch {
        errorMessage = await response.text().catch(() => 'Unknown error');
    }
    
    // User-friendly messages for common status codes
    switch (status) {
        case 400:
            return { ok: false, data: null, error: `Invalid request: ${errorMessage}`, status };
        case 401:
            return { ok: false, data: null, error: 'Authentication required. Please log in again.', status };
        case 403:
            return { ok: false, data: null, error: `Access denied: ${errorMessage}. You may not have permission to view this data.`, status };
        case 404:
            return { ok: false, data: null, error: `${context} not found. It may have been deleted or moved.`, status };
        case 429:
            return { ok: false, data: null, error: 'Too many requests. Please wait a moment and try again.', status };
        case 500:
        case 502:
        case 503:
            return { ok: false, data: null, error: 'Jira server error. Please try again later.', status };
        default:
            return { ok: false, data: null, error: `${context} failed: ${errorMessage} (${status})`, status };
    }
}

/**
 * Executes an array of async functions in batches to limit parallelism.
 * Prevents overwhelming APIs with too many concurrent requests.
 * 
 * @param {Array<Function>} tasks - Array of async functions to execute
 * @param {number} batchSize - Maximum concurrent tasks (default: MAX_PARALLEL_REQUESTS)
 * @returns {Promise<Array>} Array of results in the same order as tasks
 */
async function executeBatched(tasks, batchSize = MAX_PARALLEL_REQUESTS) {
    const results = [];
    
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        console.log(`[executeBatched] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tasks.length / batchSize)} (${batch.length} tasks)`);
        
        const batchResults = await Promise.all(
            batch.map(task => task().catch(error => {
                console.error('[executeBatched] Task error:', error);
                return { error: error.message };
            }))
        );
        
        results.push(...batchResults);
    }
    
    return results;
}

/**
 * Known ServiceType values (used for parsing from the end of summary)
 * Format: "Offer: {Unit} - {Customer} - {ServiceType}"
 */
const KNOWN_SERVICE_TYPES = [
    'Major Overhaul',
    'Minor Overhaul',
    'MODs & UPs',
    'Valve Inspection',
    'Inspection',
    'Repair',
    'Upgrade',
    'Maintenance',
    'Service',
    'Support'
];

/**
 * Link Type Names - These are the specific link types configured in Jira
 * for the Service Lifecycle. Using these instead of generic "Relates" links
 * provides more reliable and semantic linking.
 * 
 * IMPORTANT: The Jira API is counter-intuitive:
 * - inwardIssue = Issue that shows the OUTWARD text
 * - outwardIssue = Issue that shows the INWARD text
 * 
 * Link Type Definitions:
 * - Offer-Order-Relationship: Offer (shows "has order") → Order (shows "is order for")
 * - Service Work Package: Offer (shows "has work package") → Epic (shows "is work package for")
 * - Contract Delivery: Order (shows "is delivered via") → Epic (shows "delivers contract")
 */
const LINK_TYPES = {
    // Offer → Order: Links an Offer to its resulting Order
    OFFER_ORDER: 'Offer-Order-Relationship',
    
    // Offer → Epic: Links an Offer to its Work Package (Epic)
    OFFER_EPIC: 'Service Work Package (Offer->Epic)',
    
    // Order → Epic: Links an Order to its Delivery Epic
    ORDER_EPIC: 'Contract Delivery (Order->Epic)',
    
    // Legacy link type - used as fallback during migration
    RELATES: 'Relates'
};

/**
 * Custom Field IDs for date fields
 */
const DATE_FIELDS = {
    stopOfUnit: 'customfield_10147',
    overhaulStart: 'customfield_10148',
    overhaulEnd: 'customfield_10149',
    startOfCommissioning: 'customfield_10150'
};

/**
 * Custom Field ID for Team field
 * This field is set on Offers and applies to the entire service lifecycle
 */
const TEAM_FIELD = 'customfield_10001';

/**
 * Check if a date is within this week
 */
function isThisWeek(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);
    return date >= startOfWeek && date < endOfWeek;
}

/**
 * Check if a date is within this month
 */
function isThisMonth(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

/**
 * Format a date string to DD.MM.YYYY
 */
function formatDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format a date string to short format DD.MM
 */
function formatDateShort(dateStr) {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/**
 * Parse the summary to extract Unit, Customer, and ServiceType
 * Format: "{Type}: {Unit} - {Customer} - {ServiceType}"
 * 
 * @param {string} summary - The issue summary
 * @returns {Object} Parsed data { unit, customer, serviceType, raw }
 */
function parseSummary(summary) {
    if (!summary) {
        return { unit: null, customer: null, serviceType: null, raw: summary };
    }
    
    // Remove the "Offer: " or "Order: " prefix
    let content = summary;
    const prefixMatch = summary.match(/^(Offer|Order):\s*/i);
    if (prefixMatch) {
        content = summary.substring(prefixMatch[0].length);
    }
    
    // Split by " - " delimiter
    const parts = content.split(' - ');
    
    if (parts.length < 3) {
        // Not enough parts, return what we can
        return {
            unit: parts[0] || null,
            customer: parts[1] || null,
            serviceType: null,
            raw: summary
        };
    }
    
    // The last part is ServiceType
    const serviceType = parts[parts.length - 1].trim();
    
    // The first part is Unit
    const unit = parts[0].trim();
    
    // Everything in between is Customer (handles customers with "-" in name)
    const customer = parts.slice(1, -1).join(' - ').trim();
    
    return {
        unit,
        customer,
        serviceType,
        raw: summary
    };
}

/**
 * Fetch all Offers/Orders from a Jira project using JQL
 * @param {string} projectKey - The Jira project key (e.g., 'FSSS')
 * @returns {Promise<Array>} Array of issue objects
 */
async function fetchOffersOrders(projectKey) {
    console.log(`[fetchOffersOrders] Fetching from project: ${projectKey}`);
    
    // Validate project key before using in JQL
    if (!isValidProjectKey(projectKey)) {
        throw new Error(`Invalid project key format: ${projectKey}`);
    }
    
    // First, try to fetch with the specific issue types
    // Note: "Offer" and "Order" must be quoted in JQL as they may be reserved words
    // Removed "Service Request" as it doesn't exist in this project
    const jql = `project = ${projectKey} AND issuetype IN ("Offer", "Order") ORDER BY created DESC`;
    console.log(`[fetchOffersOrders] Using JQL: ${jql}`);
    
    let allIssues = [];
    let startAt = 0;
    const maxResults = 50;
    const maxTotalIssues = 100; // Limit to prevent timeout - can be increased later
    
    try {
        while (true) {
            // Use the new /rest/api/3/search/jql endpoint with GET method
            // Build query parameters - fields must be comma-separated for GET
            // Note: Do NOT use encodeURIComponent - the route template handles encoding
            // Include date fields: Stop of unit, Overhaul start/end, Start of commissioning
            // Include Team field (customfield_10001) for filtering
const fieldsParam = 'summary,issuetype,issuelinks,status,customfield_10245,customfield_10246,customfield_10147,customfield_10148,customfield_10149,customfield_10150,customfield_10001';
            
            console.log(`[fetchOffersOrders] Using GET with jql: ${jql}`);
            
            const response = await api.asUser().requestJira(
                route`/rest/api/3/search/jql?jql=${jql}&fields=${fieldsParam}&startAt=${startAt}&maxResults=${maxResults}`
            );
            
            // Use standardized response processing
            const result = await processApiResponse(response, `Search for issues in ${projectKey}`);
            
            console.log(`[fetchOffersOrders] API Response status: ${response.status}`);
            
            if (!result.ok) {
                console.error(`[fetchOffersOrders] API Error:`, result.error);
                throw new Error(result.error);
            }
            
            const data = result.data;
            console.log(`[fetchOffersOrders] Response data:`, JSON.stringify(data).substring(0, 1000));
            
            if (!data.issues || data.issues.length === 0) {
                console.log(`[fetchOffersOrders] No more issues found. Total fetched: ${allIssues.length}`);
                break;
            }
            
            // Add issues, avoiding duplicates (use issue key as unique identifier)
            const existingKeys = new Set(allIssues.map(i => i.key));
            const newIssues = data.issues.filter(i => !existingKeys.has(i.key));
            
            if (newIssues.length === 0) {
                console.log(`[fetchOffersOrders] No new issues in this batch (all duplicates). Stopping pagination.`);
                break;
            }
            
            allIssues = allIssues.concat(newIssues);
            console.log(`[fetchOffersOrders] Fetched ${allIssues.length} unique issues so far (${newIssues.length} new in this batch)`);
            
            // If we got fewer issues than requested, we've reached the end
            if (data.issues.length < maxResults) {
                console.log(`[fetchOffersOrders] Reached end of results (got ${data.issues.length} < ${maxResults})`);
                break;
            }
            
            // Limit total issues to prevent timeout
            if (allIssues.length >= maxTotalIssues) {
                console.log(`[fetchOffersOrders] Reached max limit of ${maxTotalIssues} issues`);
                break;
            }
            startAt += maxResults;
        }
        
        console.log(`[fetchOffersOrders] Total issues fetched: ${allIssues.length}`);
        
        // If no issues found, let's try a broader search to debug
        if (allIssues.length === 0) {
            console.log(`[fetchOffersOrders] No issues found. Trying broader search...`);
            const debugJql = `project = ${projectKey} ORDER BY created DESC`;
            console.log(`[fetchOffersOrders] Debug JQL: ${debugJql}`);
            
            // Note: Do NOT use encodeURIComponent - the route template handles encoding
            const debugResponse = await api.asUser().requestJira(
                route`/rest/api/3/search/jql?jql=${debugJql}&fields=summary,issuetype&maxResults=10`
            );
            
            const debugData = await debugResponse.json();
            console.log(`[fetchOffersOrders] Debug search found ${debugData.total || 0} total issues in project`);
            if (debugData.issues && debugData.issues.length > 0) {
                const issueTypes = [...new Set(debugData.issues.map(i => i.fields?.issuetype?.name))];
                console.log(`[fetchOffersOrders] Available issue types in project: ${issueTypes.join(', ')}`);
            }
        }
        
        return allIssues;
    } catch (error) {
        console.error('[fetchOffersOrders] Error:', error);
        console.error('[fetchOffersOrders] Error details:', JSON.stringify(error));
        throw error;
    }
}

/**
 * Get the Assets workspace ID
 * @returns {Promise<string|null>} Workspace ID or null
 */
async function getWorkspaceId() {
    console.log('[getWorkspaceId] Fetching workspace ID');
    
    try {
        const response = await api.asUser().requestJira(route`/rest/servicedeskapi/assets/workspace`);
        const data = await response.json();
        
        if (data.values && data.values.length > 0) {
            const workspaceId = data.values[0].workspaceId;
            console.log(`[getWorkspaceId] Found workspace ID: ${workspaceId}`);
            return workspaceId;
        }
        
        console.warn('[getWorkspaceId] No workspace found');
        return null;
    } catch (error) {
        console.error('[getWorkspaceId] Error:', error);
        return null;
    }
}

/**
 * Fetch an Asset object by ID using the Assets Gateway API
 * @param {string} workspaceId - The Assets workspace ID
 * @param {string} cloudId - The Atlassian cloud ID
 * @param {string} objectId - The Asset object ID
 * @returns {Promise<Object|null>} Asset object or null
 */
async function fetchAssetObject(workspaceId, cloudId, objectId) {
    if (!objectId) return null;
    
    console.log(`[fetchAssetObject] Fetching object ID: ${objectId}`);
    
    try {
        // Use the Assets Gateway API via external fetch
        const url = `https://api.atlassian.com/ex/jira/${cloudId}/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}`;
        
        const response = await api.fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.error(`[fetchAssetObject] Failed to fetch object ${objectId}: ${response.status}`);
            return null;
        }
        
        const result = await response.json();
        
        // Extract attributes into a simple key-value map
        const attrs = {};
        for (const a of (result.attributes || [])) {
            const name = a.objectTypeAttribute?.name || a.objectTypeAttributeId;
            const values = (a.objectAttributeValues || []).map(v => v.displayValue || v.value);
            attrs[name] = values.length === 1 ? values[0] : values;
        }
        
        return {
            id: result.id,
            objectKey: result.objectKey,
            label: result.label || result.name,
            objectType: result.objectType?.name,
            attributes: attrs
        };
    } catch (error) {
        console.error(`[fetchAssetObject] Error fetching object ${objectId}:`, error);
        return null;
    }
}

/**
 * Fetch Epic details with child tasks
 * @param {string} epicKey - The Epic issue key
 * @returns {Promise<Object|null>} Epic data with children
 */
async function fetchEpicWithTasks(epicKey) {
    console.log(`[fetchEpicWithTasks] Fetching epic: ${epicKey}`);
    
    try {
        // Fetch Epic details
        const epicResponse = await api.asUser().requestJira(
            route`/rest/api/3/issue/${epicKey}?fields=status,summary,issuetype,fixVersions,project`
        );
        const epic = await epicResponse.json();
        
        // Fetch child tasks using the new /rest/api/3/search/jql endpoint with GET
        // Note: Do NOT use encodeURIComponent - the route template handles encoding
        const childJql = `"Epic Link" = ${epicKey} OR parent = ${epicKey}`;
        
        const childResponse = await api.asUser().requestJira(
            route`/rest/api/3/search/jql?jql=${childJql}&fields=status,summary,issuetype&maxResults=50`
        );
        
        const children = await childResponse.json();
        const tasks = children.issues || [];
        
        // Calculate progress
        const doneTasks = tasks.filter(t => t.fields?.status?.name === 'Done').length;
        const totalTasks = tasks.length;
        const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
        
        console.log(`[fetchEpicWithTasks] Epic ${epicKey}: ${doneTasks}/${totalTasks} tasks done (${progress}%)`);
        
        return {
            key: epic.key,
            summary: epic.fields?.summary,
            status: epic.fields?.status?.name,
            project: epic.fields?.project?.key,
            fixVersions: (epic.fields?.fixVersions || []).map(v => v.name),
            progress,
            doneTasks,
            totalTasks,
            tasks: tasks.map(t => ({
                key: t.key,
                summary: t.fields?.summary,
                status: t.fields?.status?.name,
                type: t.fields?.issuetype?.name
            }))
        };
    } catch (error) {
        console.error(`[fetchEpicWithTasks] Error fetching epic ${epicKey}:`, error);
        return null;
    }
}

/**
 * Build the complete Customer Lifecycle data structure
 * @param {string} projectKey - The Jira project key
 * @param {string} cloudId - The Atlassian cloud ID
 * @returns {Promise<Object>} Structured data grouped by customer
 */
async function buildCustomerLifecycleData(projectKey, cloudId) {
    console.log('[buildCustomerLifecycleData] Starting data collection');
    
    // Step 1: Get workspace ID
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
        throw new Error('Could not get Assets workspace ID');
    }
    
    // Step 2: Fetch all Offers/Orders
    const allIssues = await fetchOffersOrders(projectKey);
    
    // Step 3-5: SKIPPED - We now parse Customer/Unit from Summary instead of fetching Assets
    // This significantly speeds up the loading time
    console.log(`[buildCustomerLifecycleData] Using summary parsing instead of Asset lookups`);
    
    // Step 6: Fetch all linked Epics (collect unique keys first, then fetch in BATCHES)
    // Using batched execution to prevent overwhelming the API and avoid timeouts
    console.log(`[buildCustomerLifecycleData] Fetching Epic details`);
    const epicKeys = new Set();
    for (const issue of allIssues) {
        const links = issue.fields?.issuelinks || [];
        for (const link of links) {
            const linked = link.outwardIssue || link.inwardIssue;
            if (linked?.fields?.issuetype?.name === 'Epic') {
                epicKeys.add(linked.key);
            }
        }
    }
    console.log(`[buildCustomerLifecycleData] Found ${epicKeys.size} unique epics to fetch`);
    
    const epicCache = {};
    
    // Create task functions for batched execution
    const epicTasks = Array.from(epicKeys).map(epicKey => async () => {
        const epicData = await fetchEpicWithTasks(epicKey);
        if (epicData) {
            epicCache[epicKey] = epicData;
        }
        return epicData;
    });
    
    // Execute in batches of MAX_PARALLEL_REQUESTS to avoid rate limiting
    await executeBatched(epicTasks, MAX_PARALLEL_REQUESTS);
    console.log(`[buildCustomerLifecycleData] Successfully fetched ${Object.keys(epicCache).length} epics`);
    
    // Step 7: Build grouped data structure with Pipeline logic
    // Group by Customer -> Unit -> Pipeline (Offer -> Offer-Epic -> Order -> Order-Epic)
    console.log(`[buildCustomerLifecycleData] Building pipeline structure`);
    
    // First pass: collect all issues and their parsed data
    const issueMap = {}; // key -> issue data
    
    for (const issue of allIssues) {
        const f = issue.fields;
        const parsed = parseSummary(f?.summary);
        
        // Extract date fields
        const dates = {
            stopOfUnit: f?.[DATE_FIELDS.stopOfUnit] || null,
            overhaulStart: f?.[DATE_FIELDS.overhaulStart] || null,
            overhaulEnd: f?.[DATE_FIELDS.overhaulEnd] || null,
            startOfCommissioning: f?.[DATE_FIELDS.startOfCommissioning] || null
        };
        
        // Extract Team field - can be a string, object with name/value, or null
        // Team is typically set on Offers and applies to the whole service lifecycle
        const teamRaw = f?.[TEAM_FIELD];
        let team = null;
        if (teamRaw) {
            // Handle different possible formats of the team field
            if (typeof teamRaw === 'string') {
                team = teamRaw;
            } else if (teamRaw.name) {
                team = teamRaw.name;
            } else if (teamRaw.value) {
                team = teamRaw.value;
            } else if (Array.isArray(teamRaw) && teamRaw.length > 0) {
                // Could be a multi-select, take first value
                team = teamRaw[0]?.name || teamRaw[0]?.value || teamRaw[0];
            }
        }
        
        // Process issue links using the new semantic link types
        // Priority: Specific link types > "Relates" fallback > Summary-based detection
        const links = f?.issuelinks || [];
        
        // Structured link storage
        let linkedOfferEpic = null;      // Epic linked via "Service Work Package"
        let linkedOrderEpic = null;      // Epic linked via "Contract Delivery"
        let linkedOrder = null;          // Order linked via "Offer-Order-Relationship"
        let linkedOffer = null;          // Offer linked via "Offer-Order-Relationship"
        let legacyLinkedEpic = null;     // Epic linked via "Relates" (fallback)
        let legacyLinkedOfferOrder = null; // Offer/Order linked via "Relates" (fallback)
        
        // Track migration status for reporting
        const migrationWarnings = [];
        
        for (const link of links) {
            const linkTypeName = link.type?.name || '';
            
            // In Jira's link API:
            // - outwardIssue: the issue this link points TO (shows inward text on that issue)
            // - inwardIssue: the issue this link points FROM (shows outward text on that issue)
            // When viewing from the current issue's perspective:
            // - If outwardIssue is set: current issue shows outward text, linked shows inward
            // - If inwardIssue is set: current issue shows inward text, linked shows outward
            const outward = link.outwardIssue;
            const inward = link.inwardIssue;
            const linked = outward || inward;
            
            if (!linked) continue;
            
            const linkedIssueType = linked.fields?.issuetype?.name;
            const linkedSummary = linked.fields?.summary || '';
            const linkedKey = linked.key;
            
            // Process based on specific link type
            switch (linkTypeName) {
                
                case LINK_TYPES.OFFER_EPIC:
                    // Service Work Package: Offer → Epic
                    // Offer shows "has work package", Epic shows "is work package for"
                    if (linkedIssueType === 'Epic') {
                        linkedOfferEpic = {
                            key: linkedKey,
                            summary: linkedSummary,
                            type: 'offer-epic',
                            linkType: linkTypeName,
                            data: epicCache[linkedKey] || null
                        };
                        console.log(`[processLinks] ${issue.key}: Found Offer-Epic link → ${linkedKey}`);
                    }
                    break;
                    
                case LINK_TYPES.ORDER_EPIC:
                    // Contract Delivery: Order → Epic
                    // Order shows "is delivered via", Epic shows "delivers contract"
                    if (linkedIssueType === 'Epic') {
                        linkedOrderEpic = {
                            key: linkedKey,
                            summary: linkedSummary,
                            type: 'order-epic',
                            linkType: linkTypeName,
                            data: epicCache[linkedKey] || null
                        };
                        console.log(`[processLinks] ${issue.key}: Found Order-Epic link → ${linkedKey}`);
                    }
                    break;
                    
                case LINK_TYPES.OFFER_ORDER:
                    // Offer-Order-Relationship: Offer → Order
                    // Offer shows "has order", Order shows "is order for"
                    if (linkedIssueType === 'Order') {
                        linkedOrder = {
                            key: linkedKey,
                            summary: linkedSummary,
                            status: linked.fields?.status?.name,
                            linkType: linkTypeName
                        };
                        console.log(`[processLinks] ${issue.key}: Found linked Order → ${linkedKey}`);
                    } else if (linkedIssueType === 'Offer') {
                        linkedOffer = {
                            key: linkedKey,
                            summary: linkedSummary,
                            status: linked.fields?.status?.name,
                            linkType: linkTypeName
                        };
                        console.log(`[processLinks] ${issue.key}: Found linked Offer → ${linkedKey}`);
                    }
                    break;
                    
                case LINK_TYPES.RELATES:
                default:
                    // Fallback: Handle "Relates" links and other generic link types
                    // This supports the migration period where not all links are converted yet
                    if (linkedIssueType === 'Epic') {
                        // Try to determine Epic type from summary (legacy behavior)
                        const isOfferEpic = linkedSummary.toLowerCase().startsWith('offer:');
                        const isOrderEpic = linkedSummary.toLowerCase().startsWith('order:');
                        
                        legacyLinkedEpic = {
                            key: linkedKey,
                            summary: linkedSummary,
                            type: isOfferEpic ? 'offer-epic' : isOrderEpic ? 'order-epic' : 'unknown',
                            linkType: linkTypeName || 'unknown',
                            data: epicCache[linkedKey] || null,
                            needsMigration: true
                        };
                        
                        // Log migration warning
                        migrationWarnings.push({
                            from: issue.key,
                            to: linkedKey,
                            currentType: linkTypeName || 'unknown',
                            suggestedType: isOfferEpic ? LINK_TYPES.OFFER_EPIC : 
                                          isOrderEpic ? LINK_TYPES.ORDER_EPIC : 'unknown'
                        });
                        console.warn(`[MIGRATION] ${issue.key} → ${linkedKey}: Using "${linkTypeName}" link, should be migrated to specific type`);
                        
                    } else if (linkedIssueType === 'Offer' || linkedIssueType === 'Order') {
                        legacyLinkedOfferOrder = {
                            key: linkedKey,
                            type: linkedIssueType,
                            summary: linkedSummary,
                            status: linked.fields?.status?.name,
                            linkType: linkTypeName,
                            needsMigration: true
                        };
                        console.warn(`[MIGRATION] ${issue.key} → ${linkedKey}: Using "${linkTypeName}" link for Offer/Order relationship`);
                    }
                    break;
            }
        }
        
        // Merge results: prefer specific link types over legacy fallbacks
        const linkedEpic = linkedOfferEpic || linkedOrderEpic || legacyLinkedEpic;
        const linkedOfferOrOrder = linkedOffer || linkedOrder || legacyLinkedOfferOrder;
        
        issueMap[issue.key] = {
            key: issue.key,
            type: f?.issuetype?.name,
            summary: f?.summary,
            status: f?.status?.name,
            parsed,
            dates,
            team,  // Team assigned to this issue (primarily set on Offers)
            // New structured link data
            linkedOfferEpic,      // Epic via "Service Work Package" link
            linkedOrderEpic,      // Epic via "Contract Delivery" link  
            linkedOrder,          // Order via "Offer-Order-Relationship" link
            linkedOffer,          // Offer via "Offer-Order-Relationship" link
            // Legacy/fallback (for backward compatibility during migration)
            linkedEpic,           // Any Epic (merged: specific || legacy)
            linkedOfferOrOrder,   // Any Offer/Order (merged: specific || legacy)
            // Migration tracking
            migrationWarnings,
            hasLegacyLinks: legacyLinkedEpic !== null || legacyLinkedOfferOrder !== null
        };
    }
    
    // Second pass: Build Customer -> Unit -> Pipeline structure
    const customerMap = {};
    const noCustomer = [];
    
    // Group by Customer and Unit
    for (const [key, issue] of Object.entries(issueMap)) {
        const customerName = issue.parsed.customer;
        const unitName = issue.parsed.unit;
        const serviceType = issue.parsed.serviceType;
        
        if (!customerName) {
            noCustomer.push(issue);
            continue;
        }
        
        // Create customer if not exists
        if (!customerMap[customerName]) {
            customerMap[customerName] = {
                customer: {
                    id: customerName,
                    label: customerName
                },
                units: {}
            };
        }
        
        // Create unit key (Unit + ServiceType combination)
        const unitKey = `${unitName || 'Unknown'} - ${serviceType || 'Unknown'}`;
        
        if (!customerMap[customerName].units[unitKey]) {
            customerMap[customerName].units[unitKey] = {
                unitName: unitName,
                serviceType: serviceType,
                unitKey: unitKey,
                // Pipeline stages
                offer: null,
                offerEpic: null,
                order: null,
                orderEpic: null,
                // Team (inherited from Offer)
                team: null,
                // Dates (from any issue in this unit)
                dates: {
                    stopOfUnit: null,
                    overhaulStart: null,
                    overhaulEnd: null,
                    startOfCommissioning: null
                }
            };
        }
        
        const unit = customerMap[customerName].units[unitKey];
        
        // Update dates (take first non-null value)
        if (issue.dates.stopOfUnit) unit.dates.stopOfUnit = issue.dates.stopOfUnit;
        if (issue.dates.overhaulStart) unit.dates.overhaulStart = issue.dates.overhaulStart;
        if (issue.dates.overhaulEnd) unit.dates.overhaulEnd = issue.dates.overhaulEnd;
        if (issue.dates.startOfCommissioning) unit.dates.startOfCommissioning = issue.dates.startOfCommissioning;
        
        // Place issue in correct pipeline slot using the new link-type-aware logic
        if (issue.type === 'Offer') {
            unit.offer = {
                key: issue.key,
                status: issue.status,
                summary: issue.summary
            };
            
            // Set team from Offer (this is where team is primarily assigned)
            if (issue.team) {
                unit.team = issue.team;
            }
            
            // Offer-Epic: Prefer specific "Service Work Package" link over fallback
            if (issue.linkedOfferEpic) {
                unit.offerEpic = issue.linkedOfferEpic;
            } else if (issue.linkedEpic && issue.linkedEpic.type === 'offer-epic') {
                // Fallback to legacy detection
                unit.offerEpic = issue.linkedEpic;
            }
            
            // If Offer has a linked Order via "Offer-Order-Relationship"
            if (issue.linkedOrder) {
                unit.order = {
                    key: issue.linkedOrder.key,
                    status: issue.linkedOrder.status || 'Unknown',
                    summary: issue.linkedOrder.summary,
                    linkedVia: issue.linkedOrder.linkType
                };
            }
            
        } else if (issue.type === 'Order') {
            unit.order = {
                key: issue.key,
                status: issue.status,
                summary: issue.summary
            };
            
            // Order-Epic: Prefer specific "Contract Delivery" link over fallback
            if (issue.linkedOrderEpic) {
                unit.orderEpic = issue.linkedOrderEpic;
            } else if (issue.linkedEpic && issue.linkedEpic.type === 'order-epic') {
                // Fallback to legacy detection
                unit.orderEpic = issue.linkedEpic;
            }
            
            // If Order has a linked Offer via "Offer-Order-Relationship"
            if (issue.linkedOffer) {
                unit.offer = {
                    key: issue.linkedOffer.key,
                    status: issue.linkedOffer.status || 'Unknown',
                    summary: issue.linkedOffer.summary,
                    linkedVia: issue.linkedOffer.linkType
                };
            } else if (issue.linkedOfferOrOrder && issue.linkedOfferOrOrder.type === 'Offer') {
                // Fallback: Legacy link to Offer
                unit.offer = {
                    key: issue.linkedOfferOrOrder.key,
                    status: issue.linkedOfferOrOrder.status || 'Unknown',
                    summary: issue.linkedOfferOrOrder.summary,
                    linkedVia: issue.linkedOfferOrOrder.linkType || 'legacy'
                };
            }
        }
        
        // Track if this unit has any legacy links that need migration
        if (issue.hasLegacyLinks) {
            unit.hasLegacyLinks = true;
        }
    }
    
    // Convert to arrays and sort
    const customers = Object.values(customerMap)
        .map(c => ({
            customer: c.customer,
            units: Object.values(c.units).sort((a, b) => a.unitKey.localeCompare(b.unitKey))
        }))
        .sort((a, b) => a.customer.label.localeCompare(b.customer.label));
    
    // Calculate upcoming events (this week / this month)
    const upcomingThisWeek = [];
    const upcomingThisMonth = [];
    
    for (const customer of customers) {
        for (const unit of customer.units) {
            const eventBase = {
                customer: customer.customer.label,
                unit: unit.unitName,
                serviceType: unit.serviceType
            };
            
            // Check each date field
            if (isThisWeek(unit.dates.stopOfUnit)) {
                upcomingThisWeek.push({ ...eventBase, type: 'stop', date: unit.dates.stopOfUnit, label: 'Stop of Unit' });
            } else if (isThisMonth(unit.dates.stopOfUnit)) {
                upcomingThisMonth.push({ ...eventBase, type: 'stop', date: unit.dates.stopOfUnit, label: 'Stop of Unit' });
            }
            
            if (isThisWeek(unit.dates.overhaulStart)) {
                upcomingThisWeek.push({ ...eventBase, type: 'overhaul-start', date: unit.dates.overhaulStart, label: 'Overhaul Start' });
            } else if (isThisMonth(unit.dates.overhaulStart)) {
                upcomingThisMonth.push({ ...eventBase, type: 'overhaul-start', date: unit.dates.overhaulStart, label: 'Overhaul Start' });
            }
            
            if (isThisWeek(unit.dates.overhaulEnd)) {
                upcomingThisWeek.push({ ...eventBase, type: 'overhaul-end', date: unit.dates.overhaulEnd, label: 'Overhaul End' });
            } else if (isThisMonth(unit.dates.overhaulEnd)) {
                upcomingThisMonth.push({ ...eventBase, type: 'overhaul-end', date: unit.dates.overhaulEnd, label: 'Overhaul End' });
            }
            
            if (isThisWeek(unit.dates.startOfCommissioning)) {
                upcomingThisWeek.push({ ...eventBase, type: 'commissioning', date: unit.dates.startOfCommissioning, label: 'Commissioning' });
            } else if (isThisMonth(unit.dates.startOfCommissioning)) {
                upcomingThisMonth.push({ ...eventBase, type: 'commissioning', date: unit.dates.startOfCommissioning, label: 'Commissioning' });
            }
        }
    }
    
    // Sort upcoming events by date
    upcomingThisWeek.sort((a, b) => new Date(a.date) - new Date(b.date));
    upcomingThisMonth.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    console.log(`[buildCustomerLifecycleData] Complete: ${customers.length} customers, ${noCustomer.length} without customer`);
    console.log(`[buildCustomerLifecycleData] Upcoming this week: ${upcomingThisWeek.length}, this month: ${upcomingThisMonth.length}`);
    
    // Collect migration statistics
    // This helps track the progress of migrating "Relates" links to specific link types
    const migrationStats = {
        totalLinks: 0,
        specificLinks: 0,      // Links using new specific types
        legacyLinks: 0,        // Links still using "Relates" or other generic types
        byType: {
            offerOrder: { specific: 0, legacy: 0 },
            offerEpic: { specific: 0, legacy: 0 },
            orderEpic: { specific: 0, legacy: 0 }
        },
        linksToMigrate: []     // Detailed list of links that need migration
    };
    
    // Analyze all issues for migration status
    for (const [key, issue] of Object.entries(issueMap)) {
        // Count Offer-Epic links
        if (issue.linkedOfferEpic) {
            migrationStats.specificLinks++;
            migrationStats.byType.offerEpic.specific++;
            migrationStats.totalLinks++;
        } else if (issue.linkedEpic && issue.linkedEpic.type === 'offer-epic' && issue.linkedEpic.needsMigration) {
            migrationStats.legacyLinks++;
            migrationStats.byType.offerEpic.legacy++;
            migrationStats.totalLinks++;
            migrationStats.linksToMigrate.push({
                from: issue.key,
                to: issue.linkedEpic.key,
                currentType: issue.linkedEpic.linkType,
                suggestedType: LINK_TYPES.OFFER_EPIC
            });
        }
        
        // Count Order-Epic links
        if (issue.linkedOrderEpic) {
            migrationStats.specificLinks++;
            migrationStats.byType.orderEpic.specific++;
            migrationStats.totalLinks++;
        } else if (issue.linkedEpic && issue.linkedEpic.type === 'order-epic' && issue.linkedEpic.needsMigration) {
            migrationStats.legacyLinks++;
            migrationStats.byType.orderEpic.legacy++;
            migrationStats.totalLinks++;
            migrationStats.linksToMigrate.push({
                from: issue.key,
                to: issue.linkedEpic.key,
                currentType: issue.linkedEpic.linkType,
                suggestedType: LINK_TYPES.ORDER_EPIC
            });
        }
        
        // Count Offer-Order links
        if (issue.linkedOrder || issue.linkedOffer) {
            migrationStats.specificLinks++;
            migrationStats.byType.offerOrder.specific++;
            migrationStats.totalLinks++;
        } else if (issue.linkedOfferOrOrder && issue.linkedOfferOrOrder.needsMigration) {
            migrationStats.legacyLinks++;
            migrationStats.byType.offerOrder.legacy++;
            migrationStats.totalLinks++;
            migrationStats.linksToMigrate.push({
                from: issue.key,
                to: issue.linkedOfferOrOrder.key,
                currentType: issue.linkedOfferOrOrder.linkType,
                suggestedType: LINK_TYPES.OFFER_ORDER
            });
        }
    }
    
    // Calculate migration percentage
    migrationStats.migrationProgress = migrationStats.totalLinks > 0 
        ? Math.round((migrationStats.specificLinks / migrationStats.totalLinks) * 100) 
        : 100;
    
    console.log(`[buildCustomerLifecycleData] Migration Status: ${migrationStats.specificLinks}/${migrationStats.totalLinks} links migrated (${migrationStats.migrationProgress}%)`);
    console.log(`[buildCustomerLifecycleData] Links to migrate: ${migrationStats.linksToMigrate.length}`);
    
    return { customers, noCustomer, upcomingThisWeek, upcomingThisMonth, migrationStats };
}

/**
 * Main resolver: Fetch lifecycle data
 */
resolver.define('getLifecycleData', async (req) => {
    console.log('[getLifecycleData] Request received');
    
    try {
        // =====================================================================
        // STEP 1: Access Control - Check if user is in allowed group
        // =====================================================================
        const accountId = req.context.accountId;
        console.log(`[getLifecycleData] User accountId: ${accountId}`);
        
        const accessCheck = await checkUserGroupAccess(accountId);
        if (!accessCheck.allowed) {
            console.warn(`[getLifecycleData] Access denied for user ${accountId}: ${accessCheck.error}`);
            return {
                error: accessCheck.error,
                errorType: 'ACCESS_DENIED',
                allowedGroups: accessCheck.allowedGroups || [],
                userGroups: accessCheck.groups,
                summary: { totalCustomers: 0, openOffers: 0, openOrders: 0, avgProgress: 0 },
                customers: [],
                noCustomer: []
            };
        }
        
        // =====================================================================
        // STEP 2: Load Settings & Input Validation
        // =====================================================================
        // Load project key from settings, with fallback to payload or default
        let settings;
        try {
            settings = await storage.get(STORAGE_KEYS.SETTINGS);
        } catch (err) {
            console.warn('[getLifecycleData] Could not load settings:', err);
            settings = null;
        }
        
        const configuredProjectKey = settings?.projectKey || DEFAULT_SETTINGS.projectKey;
        let projectKey = sanitizeProjectKey(req.payload?.projectKey || configuredProjectKey);
        
        if (!isValidProjectKey(projectKey)) {
            console.error(`[getLifecycleData] Invalid project key: ${projectKey}`);
            return {
                error: `Invalid project key format: "${projectKey}". Project keys must be uppercase alphanumeric (e.g., "FSSS", "PROJ1").`,
                errorType: 'INVALID_INPUT',
                summary: { totalCustomers: 0, openOffers: 0, openOrders: 0, avgProgress: 0 },
                customers: [],
                noCustomer: []
            };
        }
        
        console.log(`[getLifecycleData] Validated project key: ${projectKey}`);
        
        // Get cloud ID from context
        const cloudId = req.context.cloudId;
        console.log(`[getLifecycleData] Cloud ID: ${cloudId}`);
        
        const data = await buildCustomerLifecycleData(projectKey, cloudId);
        
        // Calculate summary statistics from units
        let totalOffers = 0;
        let openOffers = 0;
        let totalOrders = 0;
        let openOrders = 0;
        let totalProgress = 0;
        let progressCount = 0;
        
        for (const customer of data.customers) {
            for (const unit of customer.units) {
                if (unit.offer) {
                    totalOffers++;
                    if (unit.offer.status !== 'Closed Won' && unit.offer.status !== 'Closed Lost' && unit.offer.status !== 'Resolved') {
                        openOffers++;
                    }
                }
                if (unit.order) {
                    totalOrders++;
                    if (unit.order.status !== 'Resolved' && unit.order.status !== 'Done') {
                        openOrders++;
                    }
                }
                // Calculate progress from epics
                if (unit.offerEpic?.data?.progress !== undefined) {
                    totalProgress += unit.offerEpic.data.progress;
                    progressCount++;
                }
                if (unit.orderEpic?.data?.progress !== undefined) {
                    totalProgress += unit.orderEpic.data.progress;
                    progressCount++;
                }
            }
        }
        
        const summary = {
            totalCustomers: data.customers.length,
            totalOffers,
            openOffers,
            totalOrders,
            openOrders,
            avgProgress: progressCount > 0 ? Math.round(totalProgress / progressCount) : 0
        };
        
        return {
            summary,
            customers: data.customers,
            noCustomer: data.noCustomer,
            upcomingThisWeek: data.upcomingThisWeek,
            upcomingThisMonth: data.upcomingThisMonth,
            // Migration tracking data
            migrationStats: data.migrationStats
        };
    } catch (error) {
        console.error('[getLifecycleData] Error:', error);
        console.error('[getLifecycleData] Stack:', error.stack);
        
        // Provide more context based on error type
        let errorType = 'UNKNOWN_ERROR';
        let userMessage = error.message;
        
        if (error.message.includes('403') || error.message.includes('Access denied')) {
            errorType = 'ACCESS_DENIED';
            userMessage = 'You do not have permission to access this project. Please contact your Jira administrator.';
        } else if (error.message.includes('404') || error.message.includes('not found')) {
            errorType = 'NOT_FOUND';
            userMessage = 'The requested project or data could not be found. It may have been deleted or moved.';
        } else if (error.message.includes('429') || error.message.includes('rate limit')) {
            errorType = 'RATE_LIMITED';
            userMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            errorType = 'TIMEOUT';
            userMessage = 'The request timed out. Please try again or contact support if the issue persists.';
        }
        
        return {
            error: userMessage,
            errorType,
            errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            summary: { totalCustomers: 0, openOffers: 0, openOrders: 0, avgProgress: 0 },
            customers: [],
            noCustomer: []
        };
    }
});

// =============================================================================
// ADMIN SETTINGS RESOLVERS
// =============================================================================

/**
 * Get current app settings from Forge Storage
 * Used by the admin page to display current configuration.
 */
resolver.define('getSettings', async (req) => {
    console.log('[getSettings] Loading settings');
    
    try {
        const settings = await storage.get(STORAGE_KEYS.SETTINGS);
        
        if (!settings) {
            console.log('[getSettings] No settings found, returning defaults');
            return DEFAULT_SETTINGS;
        }
        
        console.log('[getSettings] Settings loaded:', settings);
        return settings;
    } catch (error) {
        console.error('[getSettings] Error:', error);
        return {
            error: error.message,
            ...DEFAULT_SETTINGS
        };
    }
});

/**
 * Save app settings to Forge Storage
 * Used by the admin page to persist configuration changes.
 */
resolver.define('saveSettings', async (req) => {
    console.log('[saveSettings] Saving settings:', req.payload);
    
    try {
        const { settings } = req.payload;
        
        // Validate settings structure
        if (!settings || typeof settings !== 'object') {
            return { error: 'Invalid settings format' };
        }
        
        // Validate project key if provided
        if (settings.projectKey) {
            const sanitizedKey = sanitizeProjectKey(settings.projectKey);
            if (!isValidProjectKey(sanitizedKey)) {
                return { error: `Invalid project key format: "${settings.projectKey}"` };
            }
            settings.projectKey = sanitizedKey;
        }
        
        // Validate allowedGroups is an array
        if (settings.allowedGroups && !Array.isArray(settings.allowedGroups)) {
            return { error: 'allowedGroups must be an array' };
        }
        
        // Sanitize group names (trim whitespace)
        if (settings.allowedGroups) {
            settings.allowedGroups = settings.allowedGroups
                .map(g => typeof g === 'string' ? g.trim() : '')
                .filter(g => g.length > 0);
        }
        
        // Build final settings object with defaults for missing fields
        const finalSettings = {
            allowedGroups: settings.allowedGroups || DEFAULT_SETTINGS.allowedGroups,
            restrictAccess: Boolean(settings.restrictAccess),
            projectKey: settings.projectKey || DEFAULT_SETTINGS.projectKey,
            updatedAt: new Date().toISOString()
        };
        
        // Save to storage
        await storage.set(STORAGE_KEYS.SETTINGS, finalSettings);
        
        console.log('[saveSettings] Settings saved successfully:', finalSettings);
        return { success: true, settings: finalSettings };
    } catch (error) {
        console.error('[saveSettings] Error:', error);
        return { error: error.message };
    }
});

/**
 * Get available Jira groups for selection in admin UI
 * Returns a list of groups that can be added to the allowed groups list.
 */
resolver.define('getAvailableGroups', async (req) => {
    console.log('[getAvailableGroups] Fetching groups');
    
    try {
        // Fetch groups from Jira using the bulk get endpoint
        // This returns groups the current user can see
        const response = await api.asUser().requestJira(
            route`/rest/api/3/groups/picker?maxResults=50`
        );
        
        const result = await processApiResponse(response, 'Fetch groups');
        
        if (!result.ok) {
            console.error('[getAvailableGroups] API error:', result.error);
            return { error: result.error, groups: [] };
        }
        
        const groups = (result.data.groups || []).map(g => ({
            name: g.name,
            html: g.html || g.name
        }));
        
        console.log(`[getAvailableGroups] Found ${groups.length} groups`);
        return { groups };
    } catch (error) {
        console.error('[getAvailableGroups] Error:', error);
        return { error: error.message, groups: [] };
    }
});

export const handler = resolver.getDefinitions();

