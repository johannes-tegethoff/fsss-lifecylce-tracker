import React, { useEffect, useState } from 'react';
import { invoke, view } from '@forge/bridge';
import './App.css';

/**
 * Service Lifecycle Tracker - Pipeline View
 * 
 * Displays a customer-grouped pipeline view showing:
 * Offer → Offer-Epic → Order → Order-Epic
 */
function App() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [expandedCustomers, setExpandedCustomers] = useState(new Set());
    const [expandedEpics, setExpandedEpics] = useState(new Set());
    const [siteUrl, setSiteUrl] = useState('');
    const [sortBy, setSortBy] = useState('name'); // name, units, completion, overhaulDate

    // Fetch lifecycle data and context on component mount
    useEffect(() => {
        setLoading(true);
        
        // Get site URL from Forge context
        view.getContext().then(context => {
            if (context.siteUrl) {
                setSiteUrl(context.siteUrl);
            }
        }).catch(err => {
            console.error('Error getting context:', err);
        });
        
        invoke('getLifecycleData', { projectKey: 'FSSS' })
            .then(result => {
                console.log('Lifecycle data received:', result);
                setData(result);
                // Auto-expand first 3 customers
                if (result.customers) {
                    const firstThree = new Set(result.customers.slice(0, 3).map(c => c.customer.id));
                    setExpandedCustomers(firstThree);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Error fetching lifecycle data:', err);
                setError(err.message || 'Failed to load data');
                setLoading(false);
            });
    }, []);

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

    // Filter units based on search, status, and service type
    const filterUnits = (units) => {
        return units.filter(unit => {
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
                const searchText = `${unit.unitName} ${unit.serviceType} ${unit.offer?.key || ''} ${unit.order?.key || ''}`;
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
                                    <div className="stage-progress">
                                        <div 
                                            className="progress-fill" 
                                            style={{ width: `${stage.data.progress || 0}%` }}
                                        />
                                    </div>
                                )}
                                <div className="stage-status">
                                    {stageStatus.label}
                                    {isEpic && stage.data && stage.data.tasks && stage.data.tasks.length > 0 && (
                                        <span className="expand-icon">{isExpanded ? ' ▼' : ' ▶'}</span>
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
        return (
            <div key={unit.unitKey} className="unit-pipeline">
                <div className="unit-header">
                    <span className="unit-name">📦 {unit.unitName}</span>
                    <span className="unit-service">{unit.serviceType}</span>
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

    // Error state
    if (error) {
        return (
            <div className="app">
                <div className="error">
                    <h2>❌ Error Loading Data</h2>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    const serviceTypes = getServiceTypes();

    return (
        <div className="app">
            {/* Upcoming Events */}
            <div className="upcoming-container">
                {renderUpcomingEvents(data.upcomingThisWeek, '📅 Diese Woche')}
                {renderUpcomingEvents(data.upcomingThisMonth, '📆 Dieser Monat')}
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
        </div>
    );
}

export default App;