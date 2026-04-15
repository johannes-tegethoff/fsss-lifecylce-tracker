import api, { route } from '@forge/api';
import { DEFAULT_FIELD_MAPPINGS, LINK_TYPES, MAX_PARALLEL_REQUESTS } from '../config.js';
import { executeBatched } from '../api/jira.js';
import { fetchAssetsInBatches, extractAssetReferences } from '../api/assets.js';
import { fetchEpicWithTasks } from '../api/epics.js';
import { isValidProjectKey } from '../validators.js';

// ============================================================================
// FIELD MAPPINGS
// ============================================================================

/**
 * Resolves the active field mappings from settings, falling back to defaults.
 * Structured into logical groups: dateFields, teamField, assetFields, keyDataFields.
 */
export function getFieldMappings(settings) {
    const m = settings?.fieldMappings || DEFAULT_FIELD_MAPPINGS;
    const fallback = (key) => m[key] || DEFAULT_FIELD_MAPPINGS[key];
    return {
        dateFields: {
            stopOfUnit: fallback('stopOfUnit'),
            overhaulStart: fallback('overhaulStart'),
            overhaulEnd: fallback('overhaulEnd'),
            startOfCommissioning: fallback('startOfCommissioning')
        },
        teamField: fallback('team'),
        assetFields: {
            customerAsset: fallback('customerAsset'),
            unitAsset: fallback('unitAsset')
        },
        keyDataFields: {
            servicenumber: fallback('servicenumber'),
            offerType: fallback('offerType'),
            outageType: fallback('outageType'),
            region: fallback('region'),
            language: fallback('language'),
            ltp: fallback('ltp'),
            organizations: fallback('organizations'),
            parallelWorks: fallback('parallelWorks')
        }
    };
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

export function isThisWeek(dateStr) {
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

export function isThisMonth(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export function formatDate(dateStr) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateShort(dateStr) {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

// ============================================================================
// SUMMARY PARSING
// ============================================================================

/**
 * Parses a Jira issue summary into its semantic parts.
 * Expected format: "{Type}: {Unit} - {Customer} - {ServiceType}"
 */
export function parseSummary(summary) {
    if (!summary) return { unit: null, customer: null, serviceType: null, raw: summary };

    const prefixMatch = summary.match(/^(Offer|Order):\s*/i);
    const content = prefixMatch ? summary.substring(prefixMatch[0].length) : summary;
    const parts = content.split(' - ');

    if (parts.length < 3) {
        return { unit: parts[0] || null, customer: parts[1] || null, serviceType: null, raw: summary };
    }

    return {
        unit: parts[0].trim(),
        customer: parts.slice(1, -1).join(' - ').trim(),  // handles customer names with " - "
        serviceType: parts[parts.length - 1].trim(),
        raw: summary
    };
}

// ============================================================================
// JIRA DATA FETCHING
// ============================================================================

/**
 * Step 1 — Fetches all Offer and Order issues from a project.
 * Only retrieves domain fields (dates, team, assets, key data) — NOT issuelinks.
 * issuelinks are fetched separately via fetchIssueLinks() to guarantee completeness.
 * Uses cursor-based pagination with a safety limit of 100 total issues.
 */
export async function fetchOffersOrders(projectKey, fieldMappings) {
    if (!isValidProjectKey(projectKey)) {
        throw new Error(`Invalid project key format: ${projectKey}`);
    }

    const jql = `project = ${projectKey} AND issuetype IN ("Offer", "Order") ORDER BY created DESC`;
    const { dateFields, teamField, assetFields, keyDataFields } = fieldMappings;

    const customFields = [
        dateFields.stopOfUnit, dateFields.overhaulStart,
        dateFields.overhaulEnd, dateFields.startOfCommissioning,
        teamField,
        assetFields.customerAsset, assetFields.unitAsset,
        keyDataFields?.servicenumber, keyDataFields?.offerType,
        keyDataFields?.outageType, keyDataFields?.region,
        keyDataFields?.language, keyDataFields?.ltp,
        keyDataFields?.organizations, keyDataFields?.parallelWorks
    ].filter(Boolean).join(',');

    // No issuelinks here — fetched individually in Step 2 for reliability
    const fieldsParam = `summary,issuetype,status,${customFields}`;
    const maxResults = 50;
    const maxTotalIssues = 500;
    let allIssues = [];
    let startAt = 0;

    try {
        while (true) {
            const response = await api.asUser().requestJira(
                route`/rest/api/3/search/jql?jql=${jql}&fields=${fieldsParam}&startAt=${startAt}&maxResults=${maxResults}`
            );

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Search failed (HTTP ${response.status}): ${body}`);
            }

            const data = await response.json();
            if (!data.issues || data.issues.length === 0) break;

            const existingKeys = new Set(allIssues.map(i => i.key));
            const newIssues = data.issues.filter(i => !existingKeys.has(i.key));
            if (newIssues.length === 0) break;

            allIssues = allIssues.concat(newIssues);
            console.log(`[fetchOffersOrders] Fetched ${allIssues.length} issues`);

            if (data.issues.length < maxResults || allIssues.length >= maxTotalIssues) break;
            startAt += maxResults;
        }

        // Diagnostic: if no issues found, log available issue types to help debugging
        if (allIssues.length === 0) {
            const debugResponse = await api.asUser().requestJira(
                route`/rest/api/3/search/jql?jql=project = ${projectKey} ORDER BY created DESC&fields=summary,issuetype&maxResults=10`
            );
            const debugData = await debugResponse.json();
            const issueTypes = [...new Set((debugData.issues || []).map(i => i.fields?.issuetype?.name))];
            console.log(`[fetchOffersOrders] No Offer/Order issues found. Available types: ${issueTypes.join(', ') || 'none'}`);
        }

        return allIssues;
    } catch (error) {
        console.error('[fetchOffersOrders] Error:', error);
        throw error;
    }
}

/**
 * Step 2 — Fetches the complete issuelinks for each issue individually.
 * The Jira bulk-search endpoint sometimes omits cross-project links; using the
 * single-issue endpoint guarantees the full link list every time.
 * Returns a Map<issueKey, issuelinks[]>.
 */
async function fetchIssueLinks(issueKeys) {
    const linksMap = new Map();
    const tasks = issueKeys.map(key => async () => {
        try {
            const resp = await api.asUser().requestJira(
                route`/rest/api/3/issue/${key}?fields=issuelinks`
            );
            if (!resp.ok) { linksMap.set(key, []); return; }
            const data = await resp.json();
            linksMap.set(key, data.fields?.issuelinks || []);
        } catch (e) {
            console.warn(`[fetchIssueLinks] Failed for ${key}:`, e.message);
            linksMap.set(key, []);
        }
    });
    await executeBatched(tasks, MAX_PARALLEL_REQUESTS);
    console.log(`[fetchIssueLinks] Resolved links for ${linksMap.size}/${issueKeys.length} issues`);
    return linksMap;
}

// ============================================================================
// ISSUE PROCESSING HELPERS
// ============================================================================

function extractSimpleValue(raw) {
    if (!raw) return null;
    if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
    if (raw.name) return raw.name;
    if (raw.value) return raw.value;
    if (raw.displayName) return raw.displayName;
    if (Array.isArray(raw)) return raw.map(v => v?.name || v?.value || String(v)).join(', ');
    return null;
}

function extractTeam(teamRaw) {
    if (!teamRaw) return null;
    if (typeof teamRaw === 'string') return teamRaw;
    if (teamRaw.name) return teamRaw.name;
    if (teamRaw.value) return teamRaw.value;
    if (Array.isArray(teamRaw) && teamRaw.length > 0) {
        return teamRaw[0]?.name || teamRaw[0]?.value || teamRaw[0];
    }
    return null;
}

function buildResolvedCustomer(customerData, assetRefs, parsed) {
    if (customerData) {
        return {
            id: customerData.id,
            objectId: assetRefs.customer?.id,
            objectKey: customerData.objectKey,
            label: customerData.label,
            name: customerData.label,
            attributes: customerData.attributes || {},
            fromAsset: true
        };
    }
    if (parsed.customer) {
        return {
            id: parsed.customer,
            objectId: assetRefs.customer?.id,
            label: parsed.customer,
            name: parsed.customer,
            attributes: {},
            fromAsset: false
        };
    }
    return null;
}

function buildResolvedUnit(unitData, assetRefs, parsed) {
    if (unitData) {
        return {
            id: unitData.id,
            objectId: assetRefs.unit?.id,
            objectKey: unitData.objectKey,
            label: unitData.label,
            name: unitData.label,
            serialNumber: unitData.attributes?.['Serial Number'] || unitData.attributes?.['Name'] || unitData.label,
            model: unitData.attributes?.['Model'] || unitData.attributes?.['Type'] || null,
            mw: unitData.attributes?.['MW'] || unitData.attributes?.['Power'] || null,
            oem: unitData.attributes?.['OEM'] || unitData.attributes?.['Manufacturer'] || null,
            site: unitData.attributes?.['Site'] || unitData.attributes?.['Location'] || null,
            attributes: unitData.attributes || {},
            fromAsset: true
        };
    }
    if (parsed.unit) {
        return {
            id: parsed.unit,
            objectId: assetRefs.unit?.id,
            label: parsed.unit,
            name: parsed.unit,
            serialNumber: parsed.unit,
            model: null, mw: null, oem: null, site: null,
            attributes: {},
            fromAsset: false
        };
    }
    return null;
}

function processIssueLinks(links, epicCache) {
    let linkedOfferEpic = null;
    let linkedOrderEpic = null;
    let linkedOrder = null;
    let linkedOffer = null;
    let legacyLinkedEpic = null;
    let legacyLinkedOfferOrder = null;
    const migrationWarnings = [];

    for (const link of links) {
        const linkTypeName = link.type?.name || '';
        
        // IMPORTANT: Link direction matters!
        // When viewing from Offer/Order perspective:
        //   - OFFER_EPIC: Offer "has work package" Epic → Epic is in outwardIssue
        //   - ORDER_EPIC: Order "is delivered via" Epic → Epic is in outwardIssue
        //   - OFFER_ORDER: Offer "has order" Order → Order is in outwardIssue
        const outward = link.outwardIssue;
        const inward = link.inwardIssue;
        
        // For generic processing, we still need a "linked" reference
        const linked = outward || inward;
        if (!linked) continue;

        const linkedIssueType = linked.fields?.issuetype?.name;
        const linkedSummary = linked.fields?.summary || '';
        const linkedKey = linked.key;

        switch (linkTypeName) {
            case LINK_TYPES.OFFER_EPIC:
                // "Service Work Package (Offer->Epic)": Offer "has work package" Epic
                // From Offer's perspective, the Epic should be in outwardIssue
                if (outward) {
                    linkedOfferEpic = { key: outward.key, summary: outward.fields?.summary || '', type: 'offer-epic', linkType: linkTypeName, data: epicCache[outward.key] || null };
                }
                break;

            case LINK_TYPES.ORDER_EPIC:
                // "Contract Delivery (Order->Epic)": Order "is delivered via" Epic
                // From Order's perspective, the Epic should be in outwardIssue
                if (outward) {
                    linkedOrderEpic = { key: outward.key, summary: outward.fields?.summary || '', type: 'order-epic', linkType: linkTypeName, data: epicCache[outward.key] || null };
                }
                break;

            case LINK_TYPES.OFFER_ORDER:
                // "Offer-Order-Relationship": Offer "has order" Order
                // From Offer's perspective: Order is in outwardIssue
                // From Order's perspective: Offer is in inwardIssue
                if (outward && outward.fields?.issuetype?.name === 'Order') {
                    linkedOrder = { key: outward.key, summary: outward.fields?.summary || '', status: outward.fields?.status?.name, linkType: linkTypeName };
                } else if (inward && inward.fields?.issuetype?.name === 'Offer') {
                    linkedOffer = { key: inward.key, summary: inward.fields?.summary || '', status: inward.fields?.status?.name, linkType: linkTypeName };
                }
                break;

            case LINK_TYPES.RELATES:
            default:
                if (linkedIssueType === 'Epic') {
                    const isOfferEpic = linkedSummary.toLowerCase().startsWith('offer:');
                    const isOrderEpic = linkedSummary.toLowerCase().startsWith('order:');
                    legacyLinkedEpic = {
                        key: linkedKey, summary: linkedSummary,
                        type: isOfferEpic ? 'offer-epic' : isOrderEpic ? 'order-epic' : 'unknown',
                        linkType: linkTypeName || 'unknown',
                        data: epicCache[linkedKey] || null,
                        needsMigration: true
                    };
                    migrationWarnings.push({
                        from: null, to: linkedKey,
                        currentType: linkTypeName || 'unknown',
                        suggestedType: isOfferEpic ? LINK_TYPES.OFFER_EPIC : isOrderEpic ? LINK_TYPES.ORDER_EPIC : 'unknown'
                    });
                    console.warn(`[MIGRATION] Legacy link to Epic ${linkedKey} — should be migrated to specific type`);
                } else if (linkedIssueType === 'Offer' || linkedIssueType === 'Order') {
                    legacyLinkedOfferOrder = {
                        key: linkedKey, type: linkedIssueType, summary: linkedSummary,
                        status: linked.fields?.status?.name, linkType: linkTypeName, needsMigration: true
                    };
                }
                break;
        }
    }

    return {
        linkedOfferEpic, linkedOrderEpic, linkedOrder, linkedOffer,
        linkedEpic: linkedOfferEpic || linkedOrderEpic || legacyLinkedEpic,
        linkedOfferOrOrder: linkedOffer || linkedOrder || legacyLinkedOfferOrder,
        legacyLinkedEpic, legacyLinkedOfferOrder,
        migrationWarnings,
        hasLegacyLinks: legacyLinkedEpic !== null || legacyLinkedOfferOrder !== null
    };
}

function collectUpcomingEvents(customers) {
    const thisWeek = [];
    const thisMonth = [];

    for (const customer of customers) {
        for (const unit of customer.units) {
            const base = { customer: customer.customer.label, unit: unit.unitName, serviceType: unit.serviceType };
            const dateEvents = [
                { date: unit.dates.stopOfUnit, type: 'stop', label: 'Stop of Unit' },
                { date: unit.dates.overhaulStart, type: 'overhaul-start', label: 'Overhaul Start' },
                { date: unit.dates.overhaulEnd, type: 'overhaul-end', label: 'Overhaul End' },
                { date: unit.dates.startOfCommissioning, type: 'commissioning', label: 'Commissioning' }
            ];
            for (const { date, type, label } of dateEvents) {
                if (isThisWeek(date)) thisWeek.push({ ...base, type, date, label });
                else if (isThisMonth(date)) thisMonth.push({ ...base, type, date, label });
            }
        }
    }

    thisWeek.sort((a, b) => new Date(a.date) - new Date(b.date));
    thisMonth.sort((a, b) => new Date(a.date) - new Date(b.date));
    return { thisWeek, thisMonth };
}

function collectMigrationStats(issueMap) {
    const stats = {
        totalLinks: 0, specificLinks: 0, legacyLinks: 0,
        byType: {
            offerOrder: { specific: 0, legacy: 0 },
            offerEpic: { specific: 0, legacy: 0 },
            orderEpic: { specific: 0, legacy: 0 }
        },
        linksToMigrate: []
    };

    for (const issue of Object.values(issueMap)) {
        if (issue.linkedOfferEpic) {
            stats.specificLinks++; stats.byType.offerEpic.specific++; stats.totalLinks++;
        } else if (issue.linkedEpic?.type === 'offer-epic' && issue.linkedEpic.needsMigration) {
            stats.legacyLinks++; stats.byType.offerEpic.legacy++; stats.totalLinks++;
            stats.linksToMigrate.push({ from: issue.key, to: issue.linkedEpic.key, currentType: issue.linkedEpic.linkType, suggestedType: LINK_TYPES.OFFER_EPIC });
        }
        if (issue.linkedOrderEpic) {
            stats.specificLinks++; stats.byType.orderEpic.specific++; stats.totalLinks++;
        } else if (issue.linkedEpic?.type === 'order-epic' && issue.linkedEpic.needsMigration) {
            stats.legacyLinks++; stats.byType.orderEpic.legacy++; stats.totalLinks++;
            stats.linksToMigrate.push({ from: issue.key, to: issue.linkedEpic.key, currentType: issue.linkedEpic.linkType, suggestedType: LINK_TYPES.ORDER_EPIC });
        }
        if (issue.linkedOrder || issue.linkedOffer) {
            stats.specificLinks++; stats.byType.offerOrder.specific++; stats.totalLinks++;
        } else if (issue.linkedOfferOrOrder?.needsMigration) {
            stats.legacyLinks++; stats.byType.offerOrder.legacy++; stats.totalLinks++;
            stats.linksToMigrate.push({ from: issue.key, to: issue.linkedOfferOrOrder.key, currentType: issue.linkedOfferOrOrder.linkType, suggestedType: LINK_TYPES.OFFER_ORDER });
        }
    }

    stats.migrationProgress = stats.totalLinks > 0
        ? Math.round((stats.specificLinks / stats.totalLinks) * 100)
        : 100;

    return stats;
}

// ============================================================================
// MAIN DATA BUILDER
// ============================================================================

/**
 * Builds the complete Customer → Unit → Pipeline data structure.
 * Fetches all Offers/Orders, resolves Asset references, fetches Epics,
 * and assembles the grouped result used by the frontend.
 */
export async function buildCustomerLifecycleData(projectKey, cloudId, fieldMappings) {
    console.log('[buildCustomerLifecycleData] Starting');

    const allIssues = await fetchOffersOrders(projectKey, fieldMappings);
    const { assetFields, dateFields, teamField, keyDataFields } = fieldMappings;

    // Collect deduplicated Asset refs for batch fetching
    const customerRefs = new Map();
    const unitRefs = new Map();
    for (const issue of allIssues) {
        const refs = extractAssetReferences(issue, assetFields);
        if (refs.customer?.id && refs.customer?.workspaceId) {
            customerRefs.set(refs.customer.id, { workspaceId: refs.customer.workspaceId, objectId: refs.customer.id });
        }
        if (refs.unit?.id && refs.unit?.workspaceId) {
            unitRefs.set(refs.unit.id, { workspaceId: refs.unit.workspaceId, objectId: refs.unit.id });
        }
    }

    console.log(`[buildCustomerLifecycleData] ${customerRefs.size} unique customers, ${unitRefs.size} unique units`);

    // Fetch Asset data — tries full HTTPS URL first, then gateway fallback
    const customerAssets = await fetchAssetsInBatches(Array.from(customerRefs.values()), cloudId);
    const customerCache = {};
    for (const [objectId, asset] of customerAssets) {
        customerCache[objectId] = asset;
        if (asset.id) customerCache[asset.id] = asset;
    }

    const unitAssets = await fetchAssetsInBatches(Array.from(unitRefs.values()), cloudId);
    const unitCache = {};
    for (const [objectId, asset] of unitAssets) {
        unitCache[objectId] = asset;
        if (asset.id) unitCache[asset.id] = asset;
    }

    // Step 2 — fetch complete issuelinks for every Offer/Order individually.
    // The bulk-search endpoint sometimes omits cross-project links; the single-issue
    // endpoint is always complete.
    const issueLinksMap = await fetchIssueLinks(allIssues.map(i => i.key));
    for (const issue of allIssues) {
        issue.fields = issue.fields || {};
        issue.fields.issuelinks = issueLinksMap.get(issue.key) || [];
    }

    // Step 2b — handle Offers that were paginated out of allIssues.
    // When an Offer (e.g. FSSS-530) is beyond the pagination limit it never appears
    // in allIssues directly. Its sibling Order (e.g. FSSS-726) IS in allIssues and
    // carries a link back to the Offer, so unit.offer gets populated — but
    // unit.offerEpic would remain null because the Offer's own issuelinks are never
    // fetched. We fix this by fetching issuelinks for any Offer that is referenced
    // from an Order but is absent from allIssues.
    const directIssueKeys = new Set(allIssues.map(i => i.key));
    const referencedOfferKeys = new Set();
    for (const [, links] of issueLinksMap) {
        for (const link of links) {
            if (link.type?.name !== LINK_TYPES.OFFER_ORDER) continue;
            // From the Order's perspective the Offer sits in inwardIssue.
            const offerRef = link.inwardIssue;
            if (offerRef?.key && !directIssueKeys.has(offerRef.key)) {
                referencedOfferKeys.add(offerRef.key);
            }
        }
    }
    let referencedOfferLinksMap = new Map();
    if (referencedOfferKeys.size > 0) {
        console.log(`[buildCustomerLifecycleData] Fetching links for ${referencedOfferKeys.size} referenced offer(s) not in allIssues: ${[...referencedOfferKeys].join(', ')}`);
        referencedOfferLinksMap = await fetchIssueLinks(Array.from(referencedOfferKeys));
    }

    // --- TEMPORARY DIAGNOSTIC: log FSSS-530 link details ---
    const fsss530 = allIssues.find(i => i.key === 'FSSS-530');
    if (fsss530) {
        const links = fsss530.fields.issuelinks;
        console.log(`[DEBUG FSSS-530] found in allIssues, ${links.length} link(s):`);
        for (const l of links) {
            const outward = l.outwardIssue;
            const inward = l.inwardIssue;
            console.log(`  type.name="${l.type?.name}"`);
            console.log(`    outwardIssue: key="${outward?.key}" issuetype="${outward?.fields?.issuetype?.name}"`);
            console.log(`    inwardIssue: key="${inward?.key}" issuetype="${inward?.fields?.issuetype?.name}"`);
        }
    } else {
        console.log('[DEBUG FSSS-530] NOT found in allIssues!');
        console.log('[DEBUG FSSS-530] allIssues keys:', allIssues.map(i => i.key).join(', '));
    }
    // --- END DIAGNOSTIC ---

    // Step 3 — collect all linked Epic keys for batch fetching.
    // Trust the semantic link type (OFFER_EPIC / ORDER_EPIC) as the primary signal —
    // the linked issue may live in a project with a different issue-type scheme.
    const epicKeys = new Set();
    for (const issue of allIssues) {
        for (const link of issue.fields.issuelinks) {
            const linked = link.outwardIssue || link.inwardIssue;
            if (!linked?.key) continue;
            const lt = link.type?.name || '';
            if (
                lt === LINK_TYPES.OFFER_EPIC ||
                lt === LINK_TYPES.ORDER_EPIC ||
                linked.fields?.issuetype?.name === 'Epic'
            ) {
                epicKeys.add(linked.key);
            }
        }
    }
    // Also collect epic keys from referenced offers that were not in allIssues.
    for (const [, links] of referencedOfferLinksMap) {
        for (const link of links) {
            const linked = link.outwardIssue || link.inwardIssue;
            if (!linked?.key) continue;
            const lt = link.type?.name || '';
            if (
                lt === LINK_TYPES.OFFER_EPIC ||
                lt === LINK_TYPES.ORDER_EPIC ||
                linked.fields?.issuetype?.name === 'Epic'
            ) {
                epicKeys.add(linked.key);
            }
        }
    }

    const epicCache = {};
    const epicTasks = Array.from(epicKeys).map(epicKey => async () => {
        const epicData = await fetchEpicWithTasks(epicKey);
        if (epicData) epicCache[epicKey] = epicData;
        return epicData;
    });
    await executeBatched(epicTasks, MAX_PARALLEL_REQUESTS);
    console.log(`[buildCustomerLifecycleData] Fetched ${Object.keys(epicCache).length}/${epicKeys.size} epics`);

    // Step 3b — resolve offerEpic for referenced offers (those not in allIssues).
    // Now that epicCache is populated we can process the referenced offers' issuelinks
    // and build a map of offerKey -> linkedOfferEpic for use during unit assembly.
    const referencedOfferEpicMap = {};
    for (const [offerKey, links] of referencedOfferLinksMap) {
        const linkResult = processIssueLinks(links, epicCache);
        if (linkResult.linkedOfferEpic) {
            referencedOfferEpicMap[offerKey] = linkResult.linkedOfferEpic;
            console.log(`[buildCustomerLifecycleData] Referenced offer ${offerKey} → offerEpic ${linkResult.linkedOfferEpic.key}`);
        }
    }

    // Build issue map: process each issue's links, Asset refs, and field data
    const issueMap = {};
    for (const issue of allIssues) {
        const f = issue.fields;
        const assetRefs = extractAssetReferences(issue, assetFields);
        const customerData = assetRefs.customer?.id ? customerCache[assetRefs.customer.id] : null;
        const unitData = assetRefs.unit?.id ? unitCache[assetRefs.unit.id] : null;
        const parsed = parseSummary(f?.summary);

        const links = processIssueLinks(f?.issuelinks || [], epicCache);
        const keyData = f?.issuetype?.name === 'Offer' ? {
            servicenumber: extractSimpleValue(f?.[keyDataFields?.servicenumber]),
            offerType:     extractSimpleValue(f?.[keyDataFields?.offerType]),
            outageType:    extractSimpleValue(f?.[keyDataFields?.outageType]),
            region:        extractSimpleValue(f?.[keyDataFields?.region]),
            language:      extractSimpleValue(f?.[keyDataFields?.language]),
            ltp:           extractSimpleValue(f?.[keyDataFields?.ltp]),
            organizations: extractSimpleValue(f?.[keyDataFields?.organizations]),
            parallelWorks: extractSimpleValue(f?.[keyDataFields?.parallelWorks])
        } : null;

        issueMap[issue.key] = {
            key: issue.key,
            type: f?.issuetype?.name,
            summary: f?.summary,
            status: f?.status?.name,
            customer: buildResolvedCustomer(customerData, assetRefs, parsed),
            unit: buildResolvedUnit(unitData, assetRefs, parsed),
            serviceType: parsed.serviceType,
            parsed,
            dates: {
                stopOfUnit: f?.[dateFields.stopOfUnit] || null,
                overhaulStart: f?.[dateFields.overhaulStart] || null,
                overhaulEnd: f?.[dateFields.overhaulEnd] || null,
                startOfCommissioning: f?.[dateFields.startOfCommissioning] || null
            },
            team: extractTeam(f?.[teamField]),
            keyData,
            ...links
        };
    }

    // Group into Customer → Unit → Pipeline structure
    const customerMap = {};
    const noCustomer = [];

    for (const issue of Object.values(issueMap)) {
        const customerData = issue.customer;
        if (!customerData) { noCustomer.push(issue); continue; }

        const customerId = customerData.id || customerData.label;
        const customerLabel = customerData.label || customerData.name || customerId;

        if (!customerMap[customerId]) {
            customerMap[customerId] = {
                customer: {
                    id: customerId,
                    objectId: customerData.objectId || null,
                    objectKey: customerData.objectKey || null,
                    label: customerLabel,
                    attributes: customerData.attributes || {},
                    fromAsset: customerData.fromAsset || false
                },
                units: {}
            };
        }

        const unitLabel = issue.unit?.label || issue.unit?.serialNumber || 'Unknown';
        const unitKey = `${unitLabel} - ${issue.serviceType || 'Unknown'}`;

        if (!customerMap[customerId].units[unitKey]) {
            customerMap[customerId].units[unitKey] = {
                unitName: unitLabel,
                unitKey,
                serviceType: issue.serviceType,
                unitAsset: issue.unit ? {
                    id: issue.unit.id,
                    objectId: issue.unit.objectId || null,
                    objectKey: issue.unit.objectKey,
                    label: issue.unit.label,
                    serialNumber: issue.unit.serialNumber,
                    model: issue.unit.model,
                    mw: issue.unit.mw,
                    oem: issue.unit.oem,
                    site: issue.unit.site,
                    attributes: issue.unit.attributes || {},
                    fromAsset: issue.unit.fromAsset || false
                } : null,
                offer: null, offerEpic: null, order: null, orderEpic: null,
                team: null, keyData: null,
                dates: { stopOfUnit: null, overhaulStart: null, overhaulEnd: null, startOfCommissioning: null }
            };
        }

        const unit = customerMap[customerId].units[unitKey];

        // Merge dates — take first non-null value
        for (const [key, val] of Object.entries(issue.dates)) {
            if (val && !unit.dates[key]) unit.dates[key] = val;
        }

        if (issue.type === 'Offer') {
            unit.offer = { key: issue.key, status: issue.status, summary: issue.summary };
            if (issue.team) unit.team = issue.team;
            if (issue.keyData) unit.keyData = issue.keyData;
            unit.offerEpic = issue.linkedOfferEpic || (issue.linkedEpic?.type === 'offer-epic' ? issue.linkedEpic : null);
            if (issue.linkedOrder) {
                unit.order = { key: issue.linkedOrder.key, status: issue.linkedOrder.status || 'Unknown', summary: issue.linkedOrder.summary, linkedVia: issue.linkedOrder.linkType };
            }
        } else if (issue.type === 'Order') {
            unit.order = { key: issue.key, status: issue.status, summary: issue.summary };
            unit.orderEpic = issue.linkedOrderEpic || (issue.linkedEpic?.type === 'order-epic' ? issue.linkedEpic : null);
            if (issue.linkedOffer) {
                unit.offer = { key: issue.linkedOffer.key, status: issue.linkedOffer.status || 'Unknown', summary: issue.linkedOffer.summary, linkedVia: issue.linkedOffer.linkType };
                // If the Offer wasn't directly in allIssues its offerEpic won't have
                // been set yet — populate it now from the pre-built lookup.
                if (!unit.offerEpic && referencedOfferEpicMap[issue.linkedOffer.key]) {
                    unit.offerEpic = referencedOfferEpicMap[issue.linkedOffer.key];
                }
            } else if (issue.linkedOfferOrOrder?.type === 'Offer') {
                unit.offer = { key: issue.linkedOfferOrOrder.key, status: issue.linkedOfferOrOrder.status || 'Unknown', summary: issue.linkedOfferOrOrder.summary, linkedVia: 'legacy' };
                if (!unit.offerEpic && referencedOfferEpicMap[issue.linkedOfferOrOrder.key]) {
                    unit.offerEpic = referencedOfferEpicMap[issue.linkedOfferOrOrder.key];
                }
            }
        }

        if (issue.hasLegacyLinks) unit.hasLegacyLinks = true;
    }

    const customers = Object.values(customerMap)
        .map(c => ({ customer: c.customer, units: Object.values(c.units).sort((a, b) => a.unitKey.localeCompare(b.unitKey)) }))
        .sort((a, b) => a.customer.label.localeCompare(b.customer.label));

    const { thisWeek: upcomingThisWeek, thisMonth: upcomingThisMonth } = collectUpcomingEvents(customers);
    const migrationStats = collectMigrationStats(issueMap);

    console.log(`[buildCustomerLifecycleData] Done: ${customers.length} customers, ${noCustomer.length} without customer`);

    return { customers, noCustomer, upcomingThisWeek, upcomingThisMonth, migrationStats };
}
