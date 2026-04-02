import React, { useEffect, useState, useCallback } from 'react';
import { invoke, view } from '@forge/bridge';
import './App.css';
import GanttTimeline from './GanttTimeline';
import ErrorBoundary from './ErrorBoundary';

/**
 * Service Lifecycle Tracker - Pipeline View
 * 
 * Displays a customer-grouped pipeline view showing:
 * Offer → Offer-Epic → Order → Order-Epic
 */
/**
 * Error type constants matching backend errorType values.
 * Used to display appropriate UI and recovery options.
 */
const ERROR_TYPES = {
    ACCESS_DENIED: 'ACCESS_DENIED',
    INVALID_INPUT: 'INVALID_INPUT',
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMITED: 'RATE_LIMITED',
    TIMEOUT: 'TIMEOUT',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Main App Component
 * Wrapped in ErrorBoundary for graceful error handling.
 */
function AppContent() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [errorDetails, setErrorDetails] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [teamFilter, setTeamFilter] = useState('all');
    const [expandedCustomers, setExpandedCustomers] = useState(new Set());
    const [expandedEpics, setExpandedEpics] = useState(new Set());
    const [siteUrl, setSiteUrl] = useState('');
    const [sortBy, setSortBy] = useState('name'); // name, units, completion, overhaulDate
    const [viewMode, setViewMode] = useState('pipeline'); // 'pipeline' | 'timeline'
    const [retryCount, setRetryCount] = useState(0);

    /**
     * Fetch lifecycle data from the backend resolver.
     * Handles various error types and sets appropriate state.
     */
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        setErrorType(null);
        setErrorDetails(null);
        
        try {
            // Get site URL from Forge context
            const context = await view.getContext();
            if (context.siteUrl) {
                setSiteUrl(context.siteUrl);
            }
            
            console.log('[App] Fetching lifecycle data...');
            const result = await invoke('getLifecycleData', { projectKey: 'FSSS' });
            console.log('[App] Lifecycle data received:', result);
            
            // Check if the result contains an error from the backend
            if (result.error) {
                console.warn('[App] Backend returned error:', result.error);
                setError(result.error);
                setErrorType(result.errorType || ERROR_TYPES.UNKNOWN_ERROR);
                setErrorDetails(result.errorDetails || null);
                
                // Still set partial data if available (for non-critical errors)
                if (result.customers && result.customers.length > 0) {
                    setData(result);
                } else {
                    setData(null);
                }
            } else {
                setData(result);
                setError(null);
                setErrorType(null);
                
                // Auto-expand first 3 customers on successful load
                if (result.customers) {
                    const firstThree = new Set(result.customers.slice(0, 3).map(c => c.customer.id));
                    setExpandedCustomers(firstThree);
                }
            }
        } catch (err) {
            console.error('[App] Error fetching lifecycle data:', err);
            setError(err.message || 'Ein unerwarteter Fehler ist aufgetreten');
            setErrorType(ERROR_TYPES.UNKNOWN_ERROR);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Retry fetching data after an error.
     * Increments retry count for tracking.
     */
    const handleRetry = useCallback(() => {
        setRetryCount(prev => prev + 1);
        fetchData();
    }, [fetchData]);

    // Fetch data on component mount and when retry is triggered
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Toggle customer expansion
    const toggleCustomer = (customerId) => {
        const newExpanded = new Set(expandedCustomers);
        if (newExpanded.has(customerId)) {
            newExpanded.delete(customerId);
        } else {
            newExpanded.add(customerId);
        }
        setExpandedCustomers(newExpanded);
    };

    // Toggle epic expansion
    const toggleEpic = (epicKey, event) => {
        event.stopPropagation(); // Prevent opening the issue
        const newExpanded = new Set(expandedEpics);
        if (newExpanded.has(epicKey)) {
            newExpanded.delete(epicKey);
        } else {
            newExpanded.add(epicKey);
        }
        setExpandedEpics(newExpanded);
    };

    // Open issue in new tab
    const openIssue = (issueKey) => {
        window.open(`${siteUrl}/browse/${issueKey}`, '_blank');
    };

    // Fuzzy match for search
    const fuzzyMatch = (text, search) => {
        if (!text || !search) return true;
        const textLower = text.toLowerCase();
        const searchTerms = search.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        return searchTerms.every(term => textLower.includes(term));
    };

    // Get unique service types for filter
    const getServiceTypes = () => {
        if (!data?.customers) return [];
        const types = new Set();
        data.customers.forEach(c => {
            c.units.forEach(u => {
                if (u.serviceType) types.add(u.serviceType);
            });
        });
        return Array.from(types).sort();
    };

    // Get unique teams for filter
    // Teams are set on Offers and apply to the entire service lifecycle
    const getTeams = () => {
        if (!data?.customers) return [];
        const teams = new Set();
        data.customers.forEach(c => {
            c.units.forEach(u => {
                if (u.team) teams.add(u.team);
            });
        });
        return Array.from(teams).sort();
    };

    // Filter units based on search, status, service type, and team
    const filterUnits = (units) => {
        return units.filter(unit => {
            // Team filter - Team is set on Offer and applies to entire lifecycle
            if (teamFilter !== 'all' && unit.team !== teamFilter) {
                return false;
            }
            
            // Service type filter
            if (serviceFilter !== 'all' && unit.serviceType !== serviceFilter) {
                return false;
            }
            
            // Status filter
            if (statusFilter === 'open-offers') {
                if (!unit.offer || unit.offer.status === 'Closed Won' || unit.offer.status === 'Closed Lost' || unit.offer.status === 'Resolved') {
                    return false;
                }
            }
            if (statusFilter === 'open-orders') {
                if (!unit.order || unit.order.status === 'Resolved' || unit.order.status === 'Done') {
                    return false;
                }
            }
            
            // Search filter
            if (searchTerm) {
                const searchText = `${unit.unitName} ${unit.serviceType} ${unit.offer?.key || ''} ${unit.order?.key || ''} ${unit.team || ''}`;
                if (!fuzzyMatch(searchText, searchTerm)) {
                    return false;
                }
            }
            
            return true;
        });
    };

    // Determine pipeline stage status and color
    const getStageStatus = (stage, type) => {
        if (!stage) {
            return { status: 'empty', color: 'gray', label: '---' };
        }
        
        if (type === 'issue') {
            // Offer or Order
            const status = stage.status?.toLowerCase() || '';
            if (status === 'resolved' || status === 'done' || status === 'closed won') {
                return { status: 'done', color: 'green', label: '✓ Done' };
            }
            if (status === 'closed lost') {
                return { status: 'lost', color: 'red', label: '✗ Lost' };
            }
            if (status === 'in progress' || status === 'work in progress') {
                return { status: 'progress', color: 'yellow', label: '⏳ In Progress' };
            }
            return { status: 'open', color: 'yellow', label: '○ Open' };
        }
        
        if (type === 'epic') {
            // Epic with progress
            const progress = stage.data?.progress || 0;
            if (progress >= 100) {
                return { status: 'done', color: 'green', label: `✓ ${progress}%` };
            }
            if (progress > 0) {
                return { status: 'progress', color: 'orange', label: `${progress}%` };
            }
            return { status: 'empty', color: 'gray', label: '0%' };
        }
        
        return { status: 'unknown', color: 'gray', label: '?' };
    };

    // Format date short
    const formatDateShort = (dateStr) => {
        if (!dateStr) return '--';
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    };

    // Calculate summary statistics for a customer
    const getCustomerSummary = (units) => {
        const summary = {
            total: 0,
            yellow: 0,
            orange: 0,
            green: 0,
            gray: 0,
            completion: 0
        };

        let totalProgress = 0;
        let progressCount = 0;

        units.forEach(unit => {
            [unit.offer, unit.offerEpic, unit.order, unit.orderEpic].forEach((stage, idx) => {
                const type = idx % 2 === 0 ? 'issue' : 'epic';
                const status = getStageStatus(stage, type);
                
                summary.total++;
                summary[status.color]++;

                if (type === 'epic' && stage?.data?.progress !== undefined) {
                    totalProgress += stage.data.progress;
                    progressCount++;
                }
            });
        });

        summary.completion = progressCount > 0 ? Math.round(totalProgress / progressCount) : 0;
        return summary;
    };

    // Sort customers based on selected criteria
    const sortCustomers = (customers) => {
        return [...customers].sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.customer.label.localeCompare(b.customer.label);
                
                case 'units':
                    return b.units.length - a.units.length;
                
                case 'completion':
                    const summaryA = getCustomerSummary(a.units);
                    const summaryB = getCustomerSummary(b.units);
                    return summaryB.completion - summaryA.completion;
                
                case 'overhaulDate':
                    const getEarliestDate = (units) => {
                        const dates = units
                            .map(u => u.dates?.overhaulStart)
                            .filter(d => d)
                            .map(d => new Date(d));
                        return dates.length > 0 ? Math.min(...dates) : Infinity;
                    };
                    return getEarliestDate(a.units) - getEarliestDate(b.units);
                
                default:
                    return 0;
            }
        });
    };

    // Render a single pipeline stage
    const renderStage = (stage, type, label, epicType = null) => {
        const stageStatus = getStageStatus(stage, type);
        const hasData = stage !== null && stage !== undefined;
        const isEpic = type === 'epic';
        const isExpanded = isEpic && hasData && expandedEpics.has(stage.key);
        
        return (
            <div className="pipeline-stage-wrapper">
                <div 
                    className={`pipeline-stage stage-${stageStatus.color} ${hasData ? 'clickable' : ''}`}
                    onClick={(e) => {
                        if (hasData && stage.key) {
                            if (isEpic) {
                                toggleEpic(stage.key, e);
                            } else {
                                openIssue(stage.key);
                            }
                        }
                    }}
                    title={hasData ? `${stage.key}: ${stage.summary || stage.data?.summary || ''}` : 'Not available'}
                >
                    <div className="stage-label">{label}</div>
                    <div className="stage-content">
                        {hasData ? (
                            <>
                                <a 
                                    href={siteUrl ? `${siteUrl}/browse/${stage.key}` : `/browse/${stage.key}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="stage-key-link"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.open(siteUrl ? `${siteUrl}/browse/${stage.key}` : `/browse/${stage.key}`, '_blank');
                                    }}
                                >
                                    {stage.key}
                                </a>
                                {type === 'epic' && stage.data && (
                                    <div className="stage-progress-container">
                                        <div className="stage-progress">
                                            <div 
                                                className="progress-fill" 
                                                style={{ width: `${stage.data.progress || 0}%` }}
                                            />
                                        </div>
                                        <span className="stage-tasks-count">
                                            {stage.data.doneTasks}/{stage.data.totalTasks}
                                        </span>
                                    </div>
                                )}
                                <div className="stage-status">
                                    {/* For epics, show expand icon only; percentage is shown in progress bar */}
                                    {isEpic && stage.data ? (
                                        <>
                                            {stage.data.progress >= 100 ? '✓ Fertig' : `${stage.data.progress}%`}
                                            {stage.data.tasks && stage.data.tasks.length > 0 && (
                                                <span className="expand-icon">{isExpanded ? ' ▼' : ' ▶'}</span>
                                            )}
                                        </>
                                    ) : (
                                        stageStatus.label
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="stage-empty">---</div>
                        )}
                    </div>
                </div>
                
                {/* Epic Tasks Dropdown */}
                {isEpic && hasData && isExpanded && stage.data && stage.data.tasks && (
                    <div className="epic-tasks">
                        <div className="epic-tasks-header">
                            Tasks ({stage.data.doneTasks}/{stage.data.totalTasks})
                        </div>
                        {stage.data.tasks.slice(0, 10).map(task => {
                            const statusIcon = task.status === 'Done' ? '✅' : 
                                             task.status === 'In Progress' ? '⏳' : '○';
                            return (
                                <div key={task.key} className="epic-task-item">
                                    <span className="task-status-icon">{statusIcon}</span>
                                                                        <a 
                                        href={siteUrl ? `${siteUrl}/browse/${task.key}` : `/browse/${task.key}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="task-key-link"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            window.open(siteUrl ? `${siteUrl}/browse/${task.key}` : `/browse/${task.key}`, '_blank');
                                        }}
                                    >
                                        {task.key}
                                    </a>
                                    <span className="task-summary">{task.summary}</span>
                                </div>
                            );
                        })}
                        {stage.data.tasks.length > 10 && (
                            <div className="epic-tasks-more">
                                +{stage.data.tasks.length - 10} weitere Tasks
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Render arrow between stages
    const renderArrow = () => (
        <div className="pipeline-arrow">▶</div>
    );

    // Render a unit pipeline row
    const renderUnitPipeline = (unit) => {
        // Get extended unit info from Asset data if available
        const unitAsset = unit.unitAsset;
        const hasAssetData = unitAsset && unitAsset.fromAsset;
        
        // Build unit display name with optional model/MW info from Asset
        let unitDisplayName = unit.unitName;
        if (hasAssetData && (unitAsset.model || unitAsset.mw)) {
            const details = [
                unitAsset.model,
                unitAsset.mw ? `${unitAsset.mw} MW` : null
            ].filter(Boolean).join(', ');
            if (details) {
                unitDisplayName = `${unit.unitName} (${details})`;
            }
        }
        
        // Build tooltip with full Asset details
        const unitTooltip = hasAssetData 
            ? [
                `Serial: ${unitAsset.serialNumber || unit.unitName}`,
                unitAsset.model ? `Model: ${unitAsset.model}` : null,
                unitAsset.mw ? `Power: ${unitAsset.mw} MW` : null,
                unitAsset.oem ? `OEM: ${unitAsset.oem}` : null,
                unitAsset.site ? `Site: ${unitAsset.site}` : null,
                unitAsset.objectKey ? `Asset: ${unitAsset.objectKey}` : null
            ].filter(Boolean).join('\n')
            : unit.unitName;
        
        return (
            <div key={unit.unitKey} className="unit-pipeline">
                <div className="unit-header">
                    <span 
                        className={`unit-name ${hasAssetData ? 'has-asset-data' : ''}`}
                        title={unitTooltip}
                    >
                        📦 {unitDisplayName}
                        {hasAssetData && <span className="asset-badge" title="Daten aus JSM Asset">✓</span>}
                    </span>
                    <span className="unit-service">{unit.serviceType}</span>
                    {/* Show team badge if team is assigned */}
                    {unit.team && (
                        <span className="unit-team" title="Zugewiesenes Team">
                            👥 {unit.team}
                        </span>
                    )}
                    {/* Show warning badge if unit has legacy links that need migration */}
                    {unit.hasLegacyLinks && (
                        <span 
                            className="unit-legacy-badge" 
                            title="Dieser Service hat Links die noch migriert werden müssen (Relates → spezifischer Link-Typ)"
                        >
                            ⚠️ Legacy Links
                        </span>
                    )}
                    <div className="unit-dates">
                        <span title="Stop of Unit">Stop: {formatDateShort(unit.dates.stopOfUnit)}</span>
                        <span className="date-separator">|</span>
                        <span title="Overhaul Start">Start: {formatDateShort(unit.dates.overhaulStart)}</span>
                        <span className="date-separator">|</span>
                        <span title="Overhaul End">End: {formatDateShort(unit.dates.overhaulEnd)}</span>
                        <span className="date-separator">|</span>
                        <span title="Commissioning">Comm: {formatDateShort(unit.dates.startOfCommissioning)}</span>
                    </div>
                </div>
                <div className="pipeline-stages">
                    {renderStage(unit.offer, 'issue', 'OFFER')}
                    {renderArrow()}
                    {renderStage(unit.offerEpic, 'epic', 'OFFER EPIC')}
                    {renderArrow()}
                    {renderStage(unit.order, 'issue', 'ORDER')}
                    {renderArrow()}
                    {renderStage(unit.orderEpic, 'epic', 'ORDER EPIC')}
                </div>
            </div>
        );
    };

    // Render customer section
    const renderCustomer = (customerData) => {
        const { customer, units } = customerData;
        const isExpanded = expandedCustomers.has(customer.id);
        const filteredUnits = filterUnits(units);
        
        if (filteredUnits.length === 0) return null;
        
        const summary = getCustomerSummary(filteredUnits);
        
        return (
            <div key={customer.id} className="customer-section">
                <div 
                    className="customer-header"
                    onClick={() => toggleCustomer(customer.id)}
                >
                    <span className="customer-toggle">{isExpanded ? '▼' : '▶'}</span>
                    <h3 className="customer-name">🏢 {customer.label}</h3>
                    
                    {/* Visual Summary Bar */}
                    <div className="customer-summary">
                        <div className="summary-bar">
                            {summary.green > 0 && (
                                <div 
                                    className="bar-segment bar-green" 
                                    style={{ width: `${(summary.green / summary.total) * 100}%` }}
                                    title={`${summary.green} done`}
                                />
                            )}
                            {summary.orange > 0 && (
                                <div 
                                    className="bar-segment bar-orange" 
                                    style={{ width: `${(summary.orange / summary.total) * 100}%` }}
                                    title={`${summary.orange} in progress`}
                                />
                            )}
                            {summary.yellow > 0 && (
                                <div 
                                    className="bar-segment bar-yellow" 
                                    style={{ width: `${(summary.yellow / summary.total) * 100}%` }}
                                    title={`${summary.yellow} open`}
                                />
                            )}
                            {summary.gray > 0 && (
                                <div 
                                    className="bar-segment bar-gray" 
                                    style={{ width: `${(summary.gray / summary.total) * 100}%` }}
                                    title={`${summary.gray} N/A`}
                                />
                            )}
                        </div>
                        <span className="summary-completion">{summary.completion}%</span>
                    </div>
                    
                    <span className="customer-count">({filteredUnits.length} Units)</span>
                </div>
                
                {isExpanded && (
                    <div className="customer-units">
                        {filteredUnits.map(renderUnitPipeline)}
                    </div>
                )}
            </div>
        );
    };

    // Render upcoming events section
    const renderUpcomingEvents = (events, title) => {
        if (!events || events.length === 0) return null;
        
        const typeColors = {
            'stop': '🛑',
            'overhaul-start': '▶️',
            'overhaul-end': '⏹️',
            'commissioning': '🚀'
        };
        
        return (
            <div className="upcoming-section">
                <h4>{title}</h4>
                <div className="upcoming-list">
                    {events.slice(0, 5).map((event, idx) => (
                        <div key={idx} className="upcoming-item">
                            <span className="upcoming-icon">{typeColors[event.type] || '📅'}</span>
                            <span className="upcoming-date">{formatDateShort(event.date)}</span>
                            <span className="upcoming-label">{event.label}</span>
                            <span className="upcoming-customer">{event.customer}</span>
                            <span className="upcoming-unit">{event.unit}</span>
                        </div>
                    ))}
                    {events.length > 5 && (
                        <div className="upcoming-more">+{events.length - 5} more</div>
                    )}
                </div>
            </div>
        );
    };

    // Render migration status panel
    // Shows progress of migrating "Relates" links to specific link types
    const renderMigrationStatus = () => {
        const stats = data?.migrationStats;
        if (!stats || stats.totalLinks === 0) return null;
        
        // Don't show if migration is complete
        if (stats.migrationProgress === 100) return null;
        
        const linkTypeLabels = {
            'Service Work Package (Offer->Epic)': 'Offer → Epic',
            'Contract Delivery (Order->Epic)': 'Order → Epic',
            'Offer-Order-Relationship': 'Offer → Order'
        };
        
        return (
            <div className="migration-section">
                <h4>🔗 Link-Migration</h4>
                <div className="migration-content">
                    {/* Progress Bar */}
                    <div className="migration-progress">
                        <div className="migration-progress-bar">
                            <div 
                                className="migration-progress-fill" 
                                style={{ width: `${stats.migrationProgress}%` }}
                            />
                        </div>
                        <span className="migration-progress-text">
                            {stats.specificLinks}/{stats.totalLinks} Links migriert ({stats.migrationProgress}%)
                        </span>
                    </div>
                    
                    {/* Breakdown by Type */}
                    <div className="migration-breakdown">
                        <div className="migration-type">
                            <span className="migration-type-label">Offer → Epic:</span>
                            <span className={`migration-type-count ${stats.byType.offerEpic.legacy > 0 ? 'has-legacy' : 'complete'}`}>
                                {stats.byType.offerEpic.specific} ✓ / {stats.byType.offerEpic.legacy} ⏳
                            </span>
                        </div>
                        <div className="migration-type">
                            <span className="migration-type-label">Order → Epic:</span>
                            <span className={`migration-type-count ${stats.byType.orderEpic.legacy > 0 ? 'has-legacy' : 'complete'}`}>
                                {stats.byType.orderEpic.specific} ✓ / {stats.byType.orderEpic.legacy} ⏳
                            </span>
                        </div>
                        <div className="migration-type">
                            <span className="migration-type-label">Offer → Order:</span>
                            <span className={`migration-type-count ${stats.byType.offerOrder.legacy > 0 ? 'has-legacy' : 'complete'}`}>
                                {stats.byType.offerOrder.specific} ✓ / {stats.byType.offerOrder.legacy} ⏳
                            </span>
                        </div>
                    </div>
                    
                    {/* Show first few links to migrate */}
                    {stats.linksToMigrate && stats.linksToMigrate.length > 0 && (
                        <details className="migration-details">
                            <summary className="migration-details-summary">
                                📋 {stats.linksToMigrate.length} Links zu migrieren
                            </summary>
                            <div className="migration-links-list">
                                {stats.linksToMigrate.slice(0, 10).map((link, idx) => (
                                    <div key={idx} className="migration-link-item">
                                        <a 
                                            href={`${siteUrl}/browse/${link.from}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="migration-link-key"
                                        >
                                            {link.from}
                                        </a>
                                        <span className="migration-link-arrow">→</span>
                                        <a 
                                            href={`${siteUrl}/browse/${link.to}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="migration-link-key"
                                        >
                                            {link.to}
                                        </a>
                                        <span className="migration-link-type" title={`Ändern zu: ${link.suggestedType}`}>
                                            {linkTypeLabels[link.suggestedType] || link.suggestedType}
                                        </span>
                                    </div>
                                ))}
                                {stats.linksToMigrate.length > 10 && (
                                    <div className="migration-links-more">
                                        +{stats.linksToMigrate.length - 10} weitere...
                                    </div>
                                )}
                            </div>
                        </details>
                    )}
                </div>
            </div>
        );
    };

    // Loading state
    if (loading) {
        return (
            <div className="app">
                <div className="loading">
                    <div className="spinner"></div>
                    <p>Loading Service Lifecycle Data...</p>
                </div>
            </div>
        );
    }

    // Error state with detailed error UI based on error type
    if (error && !data) {
        return (
            <div className="app">
                <div className="error-container">
                    {renderErrorUI(error, errorType, errorDetails, handleRetry, retryCount)}
                </div>
            </div>
        );
    }

    const serviceTypes = getServiceTypes();
    const teams = getTeams();

    return (
        <div className="app">
            {/* Upcoming Events & Migration Status */}
            <div className="upcoming-container">
                {renderUpcomingEvents(data.upcomingThisWeek, '📅 Diese Woche')}
                {renderUpcomingEvents(data.upcomingThisMonth, '📆 Dieser Monat')}
                {renderMigrationStatus()}
            </div>

            {/* Filter Section */}
            <div className="filter-section">
                <input
                    type="text"
                    placeholder="🔍 Suche nach Unit, Kunde..."
                    className="search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select 
                    className="filter-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">Alle Status</option>
                    <option value="open-offers">Offene Offers</option>
                    <option value="open-orders">Offene Orders</option>
                </select>
                <select 
                    className="filter-select"
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                >
                    <option value="all">Alle Services</option>
                    {serviceTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
                <select 
                    className="filter-select team-filter"
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                >
                    <option value="all">Alle Teams</option>
                    {teams.map(team => (
                        <option key={team} value={team}>{team}</option>
                    ))}
                </select>
                <select 
                    className="filter-select sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="name">Sortieren: Name</option>
                    <option value="units">Sortieren: # Units</option>
                    <option value="completion">Sortieren: Fortschritt</option>
                    <option value="overhaulDate">Sortieren: Overhaul Datum</option>
                </select>
            </div>

            {/* View Switcher */}
            <div className="view-switcher">
                <button 
                    className={`view-btn ${viewMode === 'pipeline' ? 'active' : ''}`}
                    onClick={() => setViewMode('pipeline')}
                >
                    📋 Pipeline
                </button>
                <button 
                    className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                    onClick={() => setViewMode('timeline')}
                >
                    📊 Timeline
                </button>
            </div>

            {/* Conditional View Rendering */}
            {viewMode === 'pipeline' ? (
                <>
                    {/* Pipeline Legend */}
                    <div className="pipeline-legend">
                        <span className="legend-item"><span className="legend-dot dot-yellow"></span> Offen</span>
                        <span className="legend-item"><span className="legend-dot dot-orange"></span> In Arbeit</span>
                        <span className="legend-item"><span className="legend-dot dot-green"></span> Fertig</span>
                        <span className="legend-item"><span className="legend-dot dot-gray"></span> Nicht vorhanden</span>
                    </div>

                    {/* Customer List */}
                    <div className="customer-list">
                        {sortCustomers(data.customers).map(renderCustomer).filter(Boolean)}
                    </div>
                </>
            ) : (
                /* Timeline/Gantt View */
                <GanttTimeline 
                    data={data}
                    siteUrl={siteUrl}
                    teamFilter={teamFilter}
                    serviceFilter={serviceFilter}
                    searchTerm={searchTerm}
                />
            )}
        </div>
    );
}

/**
 * Render appropriate error UI based on error type.
 * Provides specific guidance and recovery options for each error type.
 * 
 * @param {string} error - Error message to display
 * @param {string} errorType - Type of error (from ERROR_TYPES)
 * @param {string|null} errorDetails - Additional error details (dev only)
 * @param {function} onRetry - Callback function to retry the operation
 * @param {number} retryCount - Number of retry attempts made
 * @returns {JSX.Element} Error UI component
 */
function renderErrorUI(error, errorType, errorDetails, onRetry, retryCount) {
    // Determine icon, title, and additional guidance based on error type
    let icon = '❌';
    let title = 'Fehler beim Laden der Daten';
    let guidance = null;
    let showRetry = true;
    let showContactAdmin = false;
    
    switch (errorType) {
        case ERROR_TYPES.ACCESS_DENIED:
            icon = '🔒';
            title = 'Zugriff verweigert';
            guidance = (
                <div className="error-guidance">
                    <p>Sie sind nicht berechtigt, diese App zu verwenden.</p>
                    <p>Bitte kontaktieren Sie Ihren Jira-Administrator, um Zugriff zu erhalten.</p>
                </div>
            );
            showRetry = false;
            showContactAdmin = true;
            break;
            
        case ERROR_TYPES.INVALID_INPUT:
            icon = '⚠️';
            title = 'Ungültige Eingabe';
            guidance = (
                <div className="error-guidance">
                    <p>Die Anfrage enthält ungültige Daten.</p>
                </div>
            );
            showRetry = false;
            break;
            
        case ERROR_TYPES.NOT_FOUND:
            icon = '🔍';
            title = 'Nicht gefunden';
            guidance = (
                <div className="error-guidance">
                    <p>Das angeforderte Projekt oder die Daten wurden nicht gefunden.</p>
                    <p>Möglicherweise wurde das Projekt gelöscht oder verschoben.</p>
                </div>
            );
            showContactAdmin = true;
            break;
            
        case ERROR_TYPES.RATE_LIMITED:
            icon = '⏳';
            title = 'Zu viele Anfragen';
            guidance = (
                <div className="error-guidance">
                    <p>Sie haben zu viele Anfragen in kurzer Zeit gesendet.</p>
                    <p>Bitte warten Sie einen Moment und versuchen Sie es erneut.</p>
                </div>
            );
            break;
            
        case ERROR_TYPES.TIMEOUT:
            icon = '⏱️';
            title = 'Zeitüberschreitung';
            guidance = (
                <div className="error-guidance">
                    <p>Die Anfrage hat zu lange gedauert.</p>
                    <p>Dies kann bei großen Datenmengen passieren. Bitte versuchen Sie es erneut.</p>
                </div>
            );
            break;
            
        default:
            guidance = (
                <div className="error-guidance">
                    <p>Ein unerwarteter Fehler ist aufgetreten.</p>
                </div>
            );
            showContactAdmin = true;
    }
    
    return (
        <div className="error-card">
            <div className="error-icon">{icon}</div>
            <h2 className="error-title">{title}</h2>
            <p className="error-message">{error}</p>
            
            {guidance}
            
            {/* Show retry count if user has retried */}
            {retryCount > 0 && (
                <p className="error-retry-count">
                    Versuche: {retryCount}
                </p>
            )}
            
            {/* Error details (development mode) */}
            {errorDetails && (
                <details className="error-details">
                    <summary>Technische Details</summary>
                    <pre>{errorDetails}</pre>
                </details>
            )}
            
            <div className="error-actions">
                {showRetry && (
                    <button 
                        className="error-btn primary"
                        onClick={onRetry}
                    >
                        🔄 Erneut versuchen
                    </button>
                )}
                
                <button 
                    className="error-btn secondary"
                    onClick={() => window.location.reload()}
                >
                    Seite neu laden
                </button>
                
                {showContactAdmin && (
                    <p className="error-admin-hint">
                        Wenn das Problem weiterhin besteht, kontaktieren Sie den Jira-Administrator.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * App Component wrapped with ErrorBoundary.
 * The ErrorBoundary catches any unhandled errors in the component tree
 * and displays a fallback UI instead of crashing the entire app.
 */
function App() {
    return (
        <ErrorBoundary
            onError={(error, errorInfo) => {
                // Log errors for debugging/monitoring
                console.error('[App ErrorBoundary] Caught error:', error);
                console.error('[App ErrorBoundary] Component stack:', errorInfo.componentStack);
            }}
            onReset={() => {
                // Clear any cached state when user clicks "Try Again"
                console.log('[App ErrorBoundary] User triggered reset');
            }}
        >
            <AppContent />
        </ErrorBoundary>
    );
}

export default App;