import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

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
 * Custom Field IDs for date fields
 */
const DATE_FIELDS = {
    stopOfUnit: 'customfield_10147',
    overhaulStart: 'customfield_10148',
    overhaulEnd: 'customfield_10149',
    startOfCommissioning: 'customfield_10150'
};

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
            const fieldsParam = 'summary,issuetype,issuelinks,status,customfield_10245,customfield_10246,customfield_10147,customfield_10148,customfield_10149,customfield_10150';
            
            console.log(`[fetchOffersOrders] Using GET with jql: ${jql}`);
            
            const response = await api.asUser().requestJira(
                route`/rest/api/3/search/jql?jql=${jql}&fields=${fieldsParam}&startAt=${startAt}&maxResults=${maxResults}`
            );
            
            const data = await response.json();
            console.log(`[fetchOffersOrders] API Response status: ${response.status}`);
            console.log(`[fetchOffersOrders] Response data:`, JSON.stringify(data).substring(0, 1000));
            
            // Check for error response
            if (!response.ok) {
                console.error(`[fetchOffersOrders] API Error:`, JSON.stringify(data));
            }
            
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
    
    // Step 6: Fetch all linked Epics (collect unique keys first, then fetch in parallel)
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
    const epicPromises = Array.from(epicKeys).map(async (epicKey) => {
        const epicData = await fetchEpicWithTasks(epicKey);
        if (epicData) epicCache[epicKey] = epicData;
    });
    await Promise.all(epicPromises);
    
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
        
        // Find linked Epic (check if summary contains "Offer:" or "Order:")
        const links = f?.issuelinks || [];
        let linkedEpic = null;
        let linkedOfferOrOrder = null;
        
        for (const link of links) {
            const linked = link.outwardIssue || link.inwardIssue;
            if (!linked) continue;
            
            const linkedType = linked.fields?.issuetype?.name;
            const linkedSummary = linked.fields?.summary || '';
            
            if (linkedType === 'Epic') {
                // Determine if it's an Offer-Epic or Order-Epic based on summary
                const isOfferEpic = linkedSummary.toLowerCase().startsWith('offer:');
                const isOrderEpic = linkedSummary.toLowerCase().startsWith('order:');
                linkedEpic = {
                    key: linked.key,
                    summary: linkedSummary,
                    type: isOfferEpic ? 'offer-epic' : isOrderEpic ? 'order-epic' : 'unknown',
                    data: epicCache[linked.key] || null
                };
            } else if (linkedType === 'Offer' || linkedType === 'Order') {
                linkedOfferOrOrder = {
                    key: linked.key,
                    type: linkedType,
                    summary: linked.fields?.summary
                };
            }
        }
        
        issueMap[issue.key] = {
            key: issue.key,
            type: f?.issuetype?.name,
            summary: f?.summary,
            status: f?.status?.name,
            parsed,
            dates,
            linkedEpic,
            linkedOfferOrOrder
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
        
        // Place issue in correct pipeline slot
        if (issue.type === 'Offer') {
            unit.offer = {
                key: issue.key,
                status: issue.status,
                summary: issue.summary
            };
            // If this offer has a linked epic, it's the Offer-Epic
            if (issue.linkedEpic) {
                unit.offerEpic = issue.linkedEpic;
            }
        } else if (issue.type === 'Order') {
            unit.order = {
                key: issue.key,
                status: issue.status,
                summary: issue.summary
            };
            // If this order has a linked epic, it's the Order-Epic
            if (issue.linkedEpic) {
                unit.orderEpic = issue.linkedEpic;
            }
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
    
    return { customers, noCustomer, upcomingThisWeek, upcomingThisMonth };
}

/**
 * Main resolver: Fetch lifecycle data
 */
resolver.define('getLifecycleData', async (req) => {
    console.log('[getLifecycleData] Request received:', req);
    
    try {
        const projectKey = req.payload?.projectKey || 'FSSS';
        
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
            upcomingThisMonth: data.upcomingThisMonth
        };
    } catch (error) {
        console.error('[getLifecycleData] Error:', error);
        return {
            error: error.message,
            summary: { totalCustomers: 0, openOffers: 0, openOrders: 0, avgProgress: 0 },
            customers: [],
            noCustomer: []
        };
    }
});

export const handler = resolver.getDefinitions();

