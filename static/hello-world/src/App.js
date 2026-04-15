import { useState } from 'react';
import { router } from '@forge/bridge';
import './App.css';
import GanttTimeline from './GanttTimeline';
import ErrorBoundary from './ErrorBoundary';
import { useLifecycleData } from './hooks/useLifecycleData.js';
import { CustomerSection } from './components/CustomerSection.jsx';
import { KeyDataView } from './components/KeyDataView.jsx';

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_MODES = { PIPELINE: 'pipeline', TIMELINE: 'timeline', KEYDATA: 'keydata' };

const ERROR_TYPES = {
    ACCESS_DENIED: 'ACCESS_DENIED',
    INVALID_INPUT: 'INVALID_INPUT',
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMITED: 'RATE_LIMITED',
    TIMEOUT: 'TIMEOUT',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// ============================================================================
// PURE UTILITIES (outside component — no re-creation on every render)
// ============================================================================

function fuzzyMatch(text, search) {
    if (!text || !search) return true;
    const textLower = text.toLowerCase();
    return search.toLowerCase().split(/\s+/).filter(t => t.length > 0).every(term => textLower.includes(term));
}

function getServiceTypes(customers) {
    const types = new Set();
    customers?.forEach(c => c.units.forEach(u => { if (u.serviceType) types.add(u.serviceType); }));
    return Array.from(types).sort();
}

function getTeams(customers) {
    const teams = new Set();
    customers?.forEach(c => c.units.forEach(u => { if (u.team) teams.add(u.team); }));
    return Array.from(teams).sort();
}

const DONE_STATUSES = new Set(['resolved', 'done', 'closed won', 'closed lost']);

/**
 * Returns true if ALL present pipeline components for a unit are in a terminal
 * "done" state. Units where every component is done are not actionable and can
 * be hidden from the default view.
 */
function isUnitFullyDone(unit) {
    const components = [];

    if (unit.offer) {
        components.push(DONE_STATUSES.has((unit.offer.status || '').toLowerCase()));
    }
    if (unit.order) {
        components.push(DONE_STATUSES.has((unit.order.status || '').toLowerCase()));
    }
    if (unit.offerEpic) {
        const p = unit.offerEpic.data?.progress || 0;
        const s = (unit.offerEpic.data?.status || '').toLowerCase();
        components.push(p >= 100 || DONE_STATUSES.has(s));
    }
    if (unit.orderEpic) {
        const p = unit.orderEpic.data?.progress || 0;
        const s = (unit.orderEpic.data?.status || '').toLowerCase();
        components.push(p >= 100 || DONE_STATUSES.has(s));
    }

    // No components at all — don't hide (edge case, shouldn't occur)
    if (components.length === 0) return false;
    return components.every(isDone => isDone);
}

function filterUnits(units, { teamFilter, serviceFilter, statusFilter, searchTerm }) {
    return units.filter(unit => {
        if (teamFilter !== 'all' && unit.team !== teamFilter) return false;
        if (serviceFilter !== 'all' && unit.serviceType !== serviceFilter) return false;
        if (statusFilter === 'hide-completed' && isUnitFullyDone(unit)) return false;
        if (statusFilter === 'open-offers' && (!unit.offer || ['Closed Won', 'Closed Lost', 'Resolved'].includes(unit.offer.status))) return false;
        if (statusFilter === 'open-orders' && (!unit.order || ['Resolved', 'Done'].includes(unit.order.status))) return false;
        if (searchTerm) {
            const text = `${unit.unitName} ${unit.serviceType} ${unit.offer?.key || ''} ${unit.order?.key || ''} ${unit.team || ''}`;
            if (!fuzzyMatch(text, searchTerm)) return false;
        }
        return true;
    });
}

function sortCustomers(customers, sortBy) {
    return [...customers].sort((a, b) => {
        switch (sortBy) {
            case 'units': return b.units.length - a.units.length;
            case 'overhaulDate': {
                const earliest = units => Math.min(...units.map(u => u.dates?.overhaulStart).filter(Boolean).map(d => new Date(d)), Infinity);
                return earliest(a.units) - earliest(b.units);
            }
            default: return a.customer.label.localeCompare(b.customer.label);
        }
    });
}

// ============================================================================
// ERROR UI
// ============================================================================

function ErrorUI({ error, errorType, errorDetails, onRetry, retryCount }) {
    const config = {
        [ERROR_TYPES.ACCESS_DENIED]: { icon: '🔒', title: 'Zugriff verweigert',   showRetry: false, showAdmin: true,  text: 'Sie sind nicht berechtigt, diese App zu verwenden. Bitte kontaktieren Sie den Jira-Administrator.' },
        [ERROR_TYPES.INVALID_INPUT]: { icon: '⚠️', title: 'Ungültige Eingabe',    showRetry: false, showAdmin: false, text: 'Die Anfrage enthält ungültige Daten.' },
        [ERROR_TYPES.NOT_FOUND]:     { icon: '🔍', title: 'Nicht gefunden',        showRetry: true,  showAdmin: true,  text: 'Das Projekt oder die Daten wurden nicht gefunden.' },
        [ERROR_TYPES.RATE_LIMITED]:  { icon: '⏳', title: 'Zu viele Anfragen',     showRetry: true,  showAdmin: false, text: 'Bitte warten Sie einen Moment und versuchen Sie es erneut.' },
        [ERROR_TYPES.TIMEOUT]:       { icon: '⏱️', title: 'Zeitüberschreitung',    showRetry: true,  showAdmin: false, text: 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.' }
    };
    const { icon = '❌', title = 'Fehler', showRetry = true, showAdmin = true, text } = config[errorType] || {};

    return (
        <div className="error-card">
            <div className="error-icon">{icon}</div>
            <h2 className="error-title">{title}</h2>
            <p className="error-message">{error}</p>
            {text && <div className="error-guidance"><p>{text}</p></div>}
            {retryCount > 0 && <p className="error-retry-count">Versuche: {retryCount}</p>}
            {errorDetails && <details className="error-details"><summary>Technische Details</summary><pre>{errorDetails}</pre></details>}
            <div className="error-actions">
                {showRetry && <button className="error-btn primary" onClick={onRetry}>🔄 Erneut versuchen</button>}
                <button className="error-btn secondary" onClick={() => window.location.reload()}>Seite neu laden</button>
                {showAdmin && <p className="error-admin-hint">Wenn das Problem weiterhin besteht, kontaktieren Sie den Jira-Administrator.</p>}
            </div>
        </div>
    );
}

// ============================================================================
// UPCOMING EVENTS
// ============================================================================

function UpcomingEvents({ events, title }) {
    const [expanded, setExpanded] = useState(false);
    if (!events || events.length === 0) return null;

    const typeIcons = { stop: '🛑', 'overhaul-start': '▶️', 'overhaul-end': '⏹️', commissioning: '🚀' };
    const visible = expanded ? events : events.slice(0, 5);

    return (
        <div className="upcoming-section">
            <h4>{title}</h4>
            <div className="upcoming-list">
                {visible.map((event, idx) => (
                    <div key={idx} className="upcoming-item">
                        <span className="upcoming-icon">{typeIcons[event.type] || '📅'}</span>
                        <span className="upcoming-date">{new Date(event.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
                        <span className="upcoming-label">{event.label}</span>
                        <span className="upcoming-customer">{event.customer}</span>
                        <span className="upcoming-unit">{event.unit}</span>
                    </div>
                ))}
                {events.length > 5 && (
                    <div className="upcoming-more" onClick={() => setExpanded(e => !e)}>
                        {expanded ? '▲ Weniger anzeigen' : `+${events.length - 5} more`}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// MIGRATION STATUS
// ============================================================================

function MigrationStatus({ stats, siteUrl }) {
    if (!stats || stats.totalLinks === 0 || stats.migrationProgress === 100) return null;

    return (
        <div className="migration-section">
            <h4>🔗 Link-Migration</h4>
            <div className="migration-content">
                <div className="migration-progress">
                    <div className="migration-progress-bar">
                        <div className="migration-progress-fill" style={{ width: `${stats.migrationProgress}%` }} />
                    </div>
                    <span className="migration-progress-text">
                        {stats.specificLinks}/{stats.totalLinks} Links migriert ({stats.migrationProgress}%)
                    </span>
                </div>
                <div className="migration-breakdown">
                    {[['Offer → Epic', stats.byType.offerEpic], ['Order → Epic', stats.byType.orderEpic], ['Offer → Order', stats.byType.offerOrder]].map(([label, counts]) => (
                        <div key={label} className="migration-type">
                            <span className="migration-type-label">{label}:</span>
                            <span className={`migration-type-count ${counts.legacy > 0 ? 'has-legacy' : 'complete'}`}>
                                {counts.specific} ✓ / {counts.legacy} ⏳
                            </span>
                        </div>
                    ))}
                </div>
                {stats.linksToMigrate?.length > 0 && (
                    <details className="migration-details">
                        <summary className="migration-details-summary">📋 {stats.linksToMigrate.length} Links zu migrieren</summary>
                        <div className="migration-links-list">
                            {stats.linksToMigrate.slice(0, 10).map((link, idx) => (
                                <div key={idx} className="migration-link-item">
                                    <a href="#" className="migration-link-key" onClick={(e) => { e.preventDefault(); router.open(`${siteUrl}/browse/${link.from}`); }}>{link.from}</a>
                                    <span className="migration-link-arrow">→</span>
                                    <a href="#" className="migration-link-key" onClick={(e) => { e.preventDefault(); router.open(`${siteUrl}/browse/${link.to}`); }}>{link.to}</a>
                                    <span className="migration-link-type">{link.suggestedType}</span>
                                </div>
                            ))}
                            {stats.linksToMigrate.length > 10 && <div className="migration-links-more">+{stats.linksToMigrate.length - 10} weitere...</div>}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// MAIN APP CONTENT
// ============================================================================

function AppContent() {
    const { data, loading, error, errorType, errorDetails, siteUrl, retryCount, handleRetry, handleRefresh } = useLifecycleData();

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('hide-completed');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [teamFilter, setTeamFilter] = useState('all');
    const [sortBy, setSortBy] = useState('name');
    const [viewMode, setViewMode] = useState(VIEW_MODES.PIPELINE);
    const [expandedCustomers, setExpandedCustomers] = useState(new Set());
    const [expandedEpics, setExpandedEpics] = useState(new Set());

    const filters = { teamFilter, serviceFilter, statusFilter, searchTerm };

    const toggleCustomer = (id) => {
        setExpandedCustomers(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleEpic = (key, e) => {
        e.stopPropagation();
        setExpandedEpics(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const openIssue = (issueKey) => router.open(`${siteUrl}/browse/${issueKey}`);

    if (loading) {
        return (
            <div className="app">
                <div className="loading"><div className="spinner" /><p>Loading Service Lifecycle Data...</p></div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="app">
                <div className="error-container">
                    <ErrorUI error={error} errorType={errorType} errorDetails={errorDetails} onRetry={handleRetry} retryCount={retryCount} />
                </div>
            </div>
        );
    }

    const serviceTypes = getServiceTypes(data?.customers);
    const teams = getTeams(data?.customers);
    const sorted = sortCustomers(data.customers, sortBy);
    const makeFilteredUnits = (units) => filterUnits(units, filters);

    return (
        <div className="app">
            {/* Upcoming Events & Migration */}
            <div className="upcoming-container">
                <UpcomingEvents events={data.upcomingThisWeek}  title="📅 Diese Woche" id="week" />
                <UpcomingEvents events={data.upcomingThisMonth} title="📆 Dieser Monat" id="month" />
                <MigrationStatus stats={data.migrationStats} siteUrl={siteUrl} />
            </div>

            {/* Filters */}
            <div className="filter-section">
                <input type="text" placeholder="🔍 Suche nach Unit, Kunde..." className="search-input"
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="hide-completed">Aktive anzeigen</option>
                    <option value="all">Alle Status</option>
                    <option value="open-offers">Offene Offers</option>
                    <option value="open-orders">Offene Orders</option>
                </select>
                <select className="filter-select" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
                    <option value="all">Alle Services</option>
                    {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="filter-select team-filter" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                    <option value="all">Alle Teams</option>
                    {teams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="filter-select sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="name">Sortieren: Name</option>
                    <option value="units">Sortieren: # Units</option>
                    <option value="overhaulDate">Sortieren: Overhaul Datum</option>
                </select>
                <button className="refresh-btn" onClick={handleRefresh} title="Cache leeren und Daten neu laden">&#x21bb; Refresh</button>
            </div>

            {/* View Switcher */}
            <div className="view-switcher">
                {Object.entries({ [VIEW_MODES.PIPELINE]: '📋 Pipeline', [VIEW_MODES.TIMELINE]: '📊 Timeline', [VIEW_MODES.KEYDATA]: '🔑 Key Data' }).map(([mode, label]) => (
                    <button key={mode} className={`view-btn ${viewMode === mode ? 'active' : ''}`} onClick={() => setViewMode(mode)}>{label}</button>
                ))}
            </div>

            {/* Views */}
            {viewMode === VIEW_MODES.PIPELINE && (
                <>
                    <div className="pipeline-legend">
                        <span className="legend-item"><span className="legend-dot dot-yellow" /> Offen</span>
                        <span className="legend-item"><span className="legend-dot dot-orange" /> In Arbeit</span>
                        <span className="legend-item"><span className="legend-dot dot-green" /> Fertig</span>
                        <span className="legend-item"><span className="legend-dot dot-gray" /> Nicht vorhanden</span>
                    </div>
                    <div className="customer-list">
                        {sorted.map(customerData => {
                            const filteredUnits = makeFilteredUnits(customerData.units);
                            if (filteredUnits.length === 0) return null;
                            return (
                                <CustomerSection
                                    key={customerData.customer.id}
                                    customerData={customerData}
                                    filteredUnits={filteredUnits}
                                    siteUrl={siteUrl}
                                    expandedCustomers={expandedCustomers}
                                    expandedEpics={expandedEpics}
                                    onToggleCustomer={toggleCustomer}
                                    onToggleEpic={toggleEpic}
                                    onOpenIssue={openIssue}
                                />
                            );
                        })}
                    </div>
                </>
            )}

            {viewMode === VIEW_MODES.TIMELINE && (
                <GanttTimeline data={data} siteUrl={siteUrl} teamFilter={teamFilter} serviceFilter={serviceFilter} searchTerm={searchTerm} />
            )}

            {viewMode === VIEW_MODES.KEYDATA && (
                <KeyDataView
                    data={data}
                    siteUrl={siteUrl}
                    sortCustomers={(customers) => sortCustomers(customers, sortBy)}
                    filterUnits={makeFilteredUnits}
                />
            )}
        </div>
    );
}

// ============================================================================
// ROOT COMPONENT
// ============================================================================

function App() {
    return (
        <ErrorBoundary
            onError={(error, info) => { console.error('[App ErrorBoundary] Caught error:', error, info.componentStack); }}
            onReset={() => { console.log('[App ErrorBoundary] Reset'); }}
        >
            <AppContent />
        </ErrorBoundary>
    );
}

export default App;
