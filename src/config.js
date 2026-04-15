// ============================================================================
// APP CONFIGURATION & CONSTANTS
// ============================================================================

export const STORAGE_KEYS = {
    SETTINGS: 'app-settings',
    ALLOWED_GROUPS: 'allowed-groups',
    PROJECT_KEY: 'project-key',
    LIFECYCLE_CACHE: 'lifecycle-cache'
};

export const CACHE_CONFIG = {
    LIFECYCLE_TTL: 5 * 60 * 1000,  // 5 minutes
    ENABLED: true
};

export const DEFAULT_FIELD_MAPPINGS = {
    // Date fields
    stopOfUnit: 'customfield_10147',
    overhaulStart: 'customfield_10148',
    overhaulEnd: 'customfield_10149',
    startOfCommissioning: 'customfield_10150',
    // Team field
    team: 'customfield_10001',
    // Asset reference fields (JSM Assets)
    customerAsset: 'customfield_10246',
    unitAsset: 'customfield_10245',
    // Key Data fields (from Offer ticket)
    servicenumber: 'customfield_11250',
    offerType: 'customfield_10152',
    outageType: 'customfield_10146',
    region: 'customfield_10608',
    language: 'customfield_10151',
    ltp: 'customfield_10874',
    organizations: 'customfield_10002',
    parallelWorks: 'customfield_10740'
};

export const DEFAULT_SETTINGS = {
    allowedGroups: [],
    restrictAccess: false,
    projectKey: 'FSSS',
    fieldMappings: DEFAULT_FIELD_MAPPINGS,
    cacheEnabled: true
};

export const MAX_PARALLEL_REQUESTS = 10;

export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

export const KNOWN_SERVICE_TYPES = [
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
 * Semantic link types configured in Jira for the Service Lifecycle.
 *
 * JIRA API note: inwardIssue/outwardIssue naming is counter-intuitive.
 *   - Offer-Order-Relationship: Offer (shows "has order") → Order (shows "is order for")
 *   - Service Work Package:     Offer (shows "has work package") → Epic (shows "is work package for")
 *   - Contract Delivery:        Order (shows "is delivered via") → Epic (shows "delivers contract")
 */
export const LINK_TYPES = {
    OFFER_ORDER: 'Offer-Order-Relationship',
    OFFER_EPIC: 'Service Work Package (Offer->Epic)',
    ORDER_EPIC: 'Contract Delivery (Order->Epic)',
    RELATES: 'Relates'
};
