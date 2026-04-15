import { kvs as storage } from '@forge/kvs';
import { STORAGE_KEYS, CACHE_CONFIG, DEFAULT_SETTINGS } from '../config.js';
import { getCachedData, setCachedData } from '../cache.js';
import { checkUserGroupAccess, isValidProjectKey, sanitizeProjectKey } from '../validators.js';
import { getFieldMappings, buildCustomerLifecycleData } from '../data/lifecycle.js';

export async function handleGetLifecycleData(req) {
    const forceRefresh = req.payload?.forceRefresh === true;

    try {
        // Access control
        const accountId = req.context.accountId;
        const accessCheck = await checkUserGroupAccess(accountId);
        if (!accessCheck.allowed) {
            return {
                error: accessCheck.error,
                errorType: 'ACCESS_DENIED',
                allowedGroups: accessCheck.allowedGroups || [],
                userGroups: accessCheck.groups,
                summary: { totalCustomers: 0, openOffers: 0, openOrders: 0, avgProgress: 0 },
                customers: [], noCustomer: []
            };
        }

        // Load settings
        let settings;
        try {
            settings = await storage.get(STORAGE_KEYS.SETTINGS);
        } catch {
            settings = null;
        }

        const configuredProjectKey = settings?.projectKey || DEFAULT_SETTINGS.projectKey;
        const projectKey = sanitizeProjectKey(req.payload?.projectKey || configuredProjectKey);

        if (!isValidProjectKey(projectKey)) {
            return {
                error: `Invalid project key format: "${projectKey}". Must be uppercase alphanumeric (e.g., "FSSS").`,
                errorType: 'INVALID_INPUT',
                summary: { totalCustomers: 0, openOffers: 0, openOrders: 0, avgProgress: 0 },
                customers: [], noCustomer: []
            };
        }

        // Check cache
        const cacheKey = `${STORAGE_KEYS.LIFECYCLE_CACHE}-${projectKey}`;
        const cacheEnabled = settings?.cacheEnabled !== false;

        if (cacheEnabled && !forceRefresh) {
            const cached = await getCachedData(cacheKey, CACHE_CONFIG.LIFECYCLE_TTL);
            if (cached.hit) {
                console.log(`[getLifecycleData] Returning cached data for ${projectKey}`);
                return { ...cached.data, fromCache: true, cacheAge: Math.round((Date.now() - cached.data._cachedAt) / 1000) };
            }
        }

        // Fetch fresh data
        const fieldMappings = getFieldMappings(settings);
        const data = await buildCustomerLifecycleData(projectKey, req.context.cloudId, fieldMappings);

        // Calculate summary statistics
        let totalOffers = 0, openOffers = 0, totalOrders = 0, openOrders = 0;
        let totalProgress = 0, progressCount = 0;

        for (const customer of data.customers) {
            for (const unit of customer.units) {
                if (unit.offer) {
                    totalOffers++;
                    if (!['Closed Won', 'Closed Lost', 'Resolved'].includes(unit.offer.status)) openOffers++;
                }
                if (unit.order) {
                    totalOrders++;
                    if (!['Resolved', 'Done'].includes(unit.order.status)) openOrders++;
                }
                if (unit.offerEpic?.data?.progress !== undefined) { totalProgress += unit.offerEpic.data.progress; progressCount++; }
                if (unit.orderEpic?.data?.progress !== undefined) { totalProgress += unit.orderEpic.data.progress; progressCount++; }
            }
        }

        const result = {
            summary: {
                totalCustomers: data.customers.length,
                totalOffers, openOffers, totalOrders, openOrders,
                avgProgress: progressCount > 0 ? Math.round(totalProgress / progressCount) : 0
            },
            customers: data.customers,
            noCustomer: data.noCustomer,
            upcomingThisWeek: data.upcomingThisWeek,
            upcomingThisMonth: data.upcomingThisMonth,
            migrationStats: data.migrationStats,
            siteUrl: req.context.siteUrl || null,
            fromCache: false,
            _cachedAt: Date.now()
        };

        if (cacheEnabled) await setCachedData(cacheKey, result);
        return result;

    } catch (error) {
        console.error('[getLifecycleData] Error:', error);

        let errorType = 'UNKNOWN_ERROR';
        let userMessage = 'An unexpected error occurred. Please try again or contact your administrator.';
        if (error.message.includes('403') || error.message.includes('Access denied')) {
            errorType = 'ACCESS_DENIED';
            userMessage = 'You do not have permission to access this project.';
        } else if (error.message.includes('404') || error.message.includes('not found')) {
            errorType = 'NOT_FOUND';
            userMessage = 'The requested project or data could not be found.';
        } else if (error.message.includes('429') || error.message.includes('rate limit')) {
            errorType = 'RATE_LIMITED';
            userMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            errorType = 'TIMEOUT';
            userMessage = 'The request timed out. Please try again.';
        }

        return {
            error: userMessage, errorType,
            summary: { totalCustomers: 0, openOffers: 0, openOrders: 0, avgProgress: 0 },
            customers: [], noCustomer: []
        };
    }
}
