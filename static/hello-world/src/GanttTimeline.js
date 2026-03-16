import React, { useState } from 'react';
import './GanttTimeline.css';

/**
 * GanttTimeline Component
 * 
 * Displays a timeline/Gantt view of all services with their milestone dates:
 * - Stop of Unit (🛑)
 * - Overhaul Start (▶️)
 * - Overhaul End (⏹️)
 * - Commissioning (🚀)
 * 
 * Features:
 * - Scope selection: Week, Month, Year
 * - Scroll navigation (previous/next)
 * - Today indicator
 * - Color-coded milestones
 */

// Milestone configuration with colors and icons
const MILESTONES = {
    stopOfUnit: { label: 'Stop', color: '#DE350B', icon: '🛑' },
    overhaulStart: { label: 'Start', color: '#FF8B00', icon: '▶️' },
    overhaulEnd: { label: 'Ende', color: '#36B37E', icon: '⏹️' },
    startOfCommissioning: { label: 'Comm.', color: '#0052CC', icon: '🚀' }
};

function GanttTimeline({ data, siteUrl, teamFilter, serviceFilter, searchTerm }) {
    // Timeline scope: 'week', 'month', 'year'
    const [scope, setScope] = useState('month');
    
    // Current reference date (start of visible range)
    const [referenceDate, setReferenceDate] = useState(() => {
        const now = new Date();
        // Start from beginning of current month
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });

    // ========================================
    // DATE RANGE CALCULATIONS
    // ========================================
    
    /**
     * Calculate the visible date range based on current scope
     * @returns {Object} { start: Date, end: Date }
     */
    const getDateRange = () => {
        const start = new Date(referenceDate);
        const end = new Date(referenceDate);
        
        switch (scope) {
            case 'week':
                // Show 4 weeks
                end.setDate(end.getDate() + 28);
                break;
            case 'month':
                // Show 3 months
                end.setMonth(end.getMonth() + 3);
                break;
            case 'year':
                // Show 12 months
                end.setMonth(end.getMonth() + 12);
                break;
            default:
                end.setMonth(end.getMonth() + 3);
        }
        
        return { start, end };
    };

    // ========================================
    // NAVIGATION FUNCTIONS
    // ========================================
    
    /**
     * Navigate to previous time period
     */
    const navigatePrevious = () => {
        const newDate = new Date(referenceDate);
        switch (scope) {
            case 'week':
                newDate.setDate(newDate.getDate() - 14);
                break;
            case 'month':
                newDate.setMonth(newDate.getMonth() - 1);
                break;
            case 'year':
                newDate.setMonth(newDate.getMonth() - 3);
                break;
            default:
                newDate.setMonth(newDate.getMonth() - 1);
        }
        setReferenceDate(newDate);
    };
    
    /**
     * Navigate to next time period
     */
    const navigateNext = () => {
        const newDate = new Date(referenceDate);
        switch (scope) {
            case 'week':
                newDate.setDate(newDate.getDate() + 14);
                break;
            case 'month':
                newDate.setMonth(newDate.getMonth() + 1);
                break;
            case 'year':
                newDate.setMonth(newDate.getMonth() + 3);
                break;
            default:
                newDate.setMonth(newDate.getMonth() + 1);
        }
        setReferenceDate(newDate);
    };
    
    /**
     * Navigate to today (reset to current period)
     */
    const navigateToday = () => {
        const now = new Date();
        setReferenceDate(new Date(now.getFullYear(), now.getMonth(), 1));
    };

    // ========================================
    // TIME HEADER GENERATION
    // ========================================
    
    /**
     * Get ISO week number for a date
     */
    const getWeekNumber = (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };
    
    /**
     * Generate time headers based on current scope
     * @returns {Object} { headers: [], subHeaders: [] }
     */
    const generateTimeHeaders = () => {
        const { start, end } = getDateRange();
        const headers = [];
        const subHeaders = [];
        
        switch (scope) {
            case 'week':
                // Headers: Weeks, SubHeaders: Days
                let currentWeek = new Date(start);
                while (currentWeek < end) {
                    headers.push({
                        label: `KW ${getWeekNumber(currentWeek)}`,
                        span: 7
                    });
                    
                    // Generate days for this week
                    for (let i = 0; i < 7; i++) {
                        const day = new Date(currentWeek);
                        day.setDate(day.getDate() + i);
                        if (day < end) {
                            subHeaders.push({
                                label: day.getDate().toString(),
                                date: new Date(day),
                                isWeekend: day.getDay() === 0 || day.getDay() === 6
                            });
                        }
                    }
                    currentWeek.setDate(currentWeek.getDate() + 7);
                }
                break;
                
            case 'month':
                // Headers: Months, SubHeaders: Weeks
                let currentMonth = new Date(start);
                while (currentMonth < end) {
                    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
                    const weeksInMonth = Math.ceil(monthEnd.getDate() / 7);
                    
                    headers.push({
                        label: currentMonth.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
                        span: weeksInMonth
                    });
                    
                    // Generate weeks for this month
                    let weekStart = new Date(currentMonth);
                    while (weekStart.getMonth() === currentMonth.getMonth() && weekStart < end) {
                        subHeaders.push({
                            label: `${weekStart.getDate()}.`,
                            date: new Date(weekStart),
                            isFirstOfMonth: weekStart.getDate() <= 7
                        });
                        weekStart.setDate(weekStart.getDate() + 7);
                    }
                    
                    currentMonth.setMonth(currentMonth.getMonth() + 1);
                    currentMonth.setDate(1);
                }
                break;
                
            case 'year':
                // Headers: Quarters, SubHeaders: Months
                let currentQuarter = new Date(start);
                while (currentQuarter < end) {
                    const quarterNum = Math.ceil((currentQuarter.getMonth() + 1) / 3);
                    headers.push({
                        label: `Q${quarterNum} ${currentQuarter.getFullYear()}`,
                        span: 3
                    });
                    
                    // Generate months for this quarter
                    for (let i = 0; i < 3; i++) {
                        const month = new Date(currentQuarter);
                        month.setMonth(month.getMonth() + i);
                        if (month < end) {
                            subHeaders.push({
                                label: month.toLocaleDateString('de-DE', { month: 'short' }),
                                date: new Date(month),
                                isFirstOfQuarter: i === 0
                            });
                        }
                    }
                    
                    currentQuarter.setMonth(currentQuarter.getMonth() + 3);
                }
                break;
                
            default:
                break;
        }
        
        return { headers, subHeaders };
    };

    // ========================================
    // POSITION CALCULATIONS
    // ========================================
    
    /**
     * Calculate position of a date on the timeline (as percentage)
     * @param {string} dateStr - ISO date string
     * @returns {number|null} Position as percentage (0-100) or null if outside range
     */
    const getDatePosition = (dateStr) => {
        if (!dateStr) return null;
        
        const date = new Date(dateStr);
        const { start, end } = getDateRange();
        
        // Check if date is within visible range
        if (date < start || date > end) return null;
        
        const totalMs = end - start;
        const offsetMs = date - start;
        
        return (offsetMs / totalMs) * 100;
    };
    
    /**
     * Get today's position on the timeline
     * @returns {number|null} Position as percentage or null if outside range
     */
    const getTodayPosition = () => {
        const today = new Date();
        today.setHours(12, 0, 0, 0); // Normalize to noon
        return getDatePosition(today.toISOString());
    };

    // ========================================
    // DATA FILTERING & PREPARATION
    // ========================================
    
    /**
     * Collect and filter all units for the timeline
     * Applies the same filters as the pipeline view
     * @returns {Array} Filtered and sorted units
     */
    const getTimelineUnits = () => {
        if (!data?.customers) return [];
        
        const units = [];
        
        data.customers.forEach(customer => {
            customer.units.forEach(unit => {
                // Apply team filter
                if (teamFilter !== 'all' && unit.team !== teamFilter) return;
                
                // Apply service type filter
                if (serviceFilter !== 'all' && unit.serviceType !== serviceFilter) return;
                
                // Apply search filter
                if (searchTerm) {
                    const searchText = `${unit.unitName} ${unit.serviceType} ${customer.customer.label} ${unit.team || ''}`.toLowerCase();
                    if (!searchText.includes(searchTerm.toLowerCase())) return;
                }
                
                // Check if unit has any dates
                const hasAnyDate = Object.values(unit.dates).some(d => d);
                
                if (hasAnyDate) {
                    units.push({
                        ...unit,
                        customerName: customer.customer.label,
                        customerId: customer.customer.id
                    });
                }
            });
        });
        
        // Sort by earliest date
        units.sort((a, b) => {
            const getEarliestDate = (u) => {
                const dates = Object.values(u.dates)
                    .filter(d => d)
                    .map(d => new Date(d));
                return dates.length > 0 ? Math.min(...dates) : Infinity;
            };
            return getEarliestDate(a) - getEarliestDate(b);
        });
        
        return units;
    };

    // ========================================
    // HELPER FUNCTIONS
    // ========================================
    
    /**
     * Format date for tooltip display
     */
    const formatDate = (dateStr) => {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleDateString('de-DE', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });
    };

    // ========================================
    // RENDER
    // ========================================
    
    const { headers, subHeaders } = generateTimeHeaders();
    const timelineUnits = getTimelineUnits();
    const todayPosition = getTodayPosition();
    const { start: rangeStart, end: rangeEnd } = getDateRange();
    
    return (
        <div className="gantt-container">
            {/* Header with Controls */}
            <div className="gantt-header">
                <div className="gantt-title">
                    <h3>📊 Timeline</h3>
                    <span className="gantt-range">
                        {rangeStart.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}
                        {' - '}
                        {rangeEnd.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}
                    </span>
                </div>
                
                <div className="gantt-controls">
                    {/* Scope Selector */}
                    <div className="gantt-scope-selector">
                        <button 
                            className={`scope-btn ${scope === 'week' ? 'active' : ''}`}
                            onClick={() => setScope('week')}
                        >
                            Woche
                        </button>
                        <button 
                            className={`scope-btn ${scope === 'month' ? 'active' : ''}`}
                            onClick={() => setScope('month')}
                        >
                            Monat
                        </button>
                        <button 
                            className={`scope-btn ${scope === 'year' ? 'active' : ''}`}
                            onClick={() => setScope('year')}
                        >
                            Jahr
                        </button>
                    </div>
                    
                    {/* Navigation */}
                    <div className="gantt-navigation">
                        <button className="nav-btn" onClick={navigatePrevious}>
                            ◀ Zurück
                        </button>
                        <button className="nav-btn today-btn" onClick={navigateToday}>
                            Heute
                        </button>
                        <button className="nav-btn" onClick={navigateNext}>
                            Weiter ▶
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Milestone Legend */}
            <div className="gantt-legend">
                {Object.entries(MILESTONES).map(([key, config]) => (
                    <span key={key} className="gantt-legend-item">
                        <span 
                            className="gantt-legend-marker" 
                            style={{ backgroundColor: config.color }}
                        />
                        {config.icon} {config.label}
                    </span>
                ))}
            </div>
            
            {/* Timeline Grid */}
            <div className="gantt-timeline">
                {/* Time Headers */}
                <div className="gantt-time-header">
                    <div className="gantt-label-column gantt-header-cell">
                        Service
                    </div>
                    <div className="gantt-time-columns">
                        {/* Main Headers */}
                        <div className="gantt-headers-main">
                            {headers.map((header, idx) => (
                                <div 
                                    key={idx} 
                                    className="gantt-header-main"
                                    style={{ flex: header.span }}
                                >
                                    {header.label}
                                </div>
                            ))}
                        </div>
                        {/* Sub Headers */}
                        <div className="gantt-headers-sub">
                            {subHeaders.map((sub, idx) => (
                                <div 
                                    key={idx} 
                                    className={`gantt-header-sub ${sub.isWeekend ? 'weekend' : ''}`}
                                >
                                    {sub.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                
                {/* Timeline Rows */}
                <div className="gantt-rows">
                    {timelineUnits.length === 0 ? (
                        <div className="gantt-empty">
                            Keine Services mit Terminen gefunden
                        </div>
                    ) : (
                        timelineUnits.map((unit) => (
                            <div 
                                key={`${unit.customerId}-${unit.unitKey}`} 
                                className="gantt-row"
                            >
                                {/* Label Column */}
                                <div className="gantt-label-column">
                                    <div className="gantt-unit-info">
                                        <span className="gantt-unit-name" title={unit.unitName}>
                                            {unit.unitName}
                                        </span>
                                        <span className="gantt-customer-name" title={unit.customerName}>
                                            {unit.customerName}
                                        </span>
                                        {unit.team && (
                                            <span className="gantt-team-badge">
                                                👥 {unit.team}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Timeline Bar Area */}
                                <div className="gantt-bar-container">
                                    {/* Background Grid */}
                                    <div className="gantt-grid">
                                        {subHeaders.map((sub, idx) => (
                                            <div 
                                                key={idx} 
                                                className={`gantt-grid-cell ${sub.isWeekend ? 'weekend' : ''}`}
                                            />
                                        ))}
                                    </div>
                                    
                                    {/* Today Indicator */}
                                    {todayPosition !== null && (
                                        <div 
                                            className="gantt-today-line"
                                            style={{ left: `${todayPosition}%` }}
                                            title="Heute"
                                        />
                                    )}
                                    
                                    {/* Duration Bar (connects first to last milestone) */}
                                    {(() => {
                                        const positions = Object.keys(MILESTONES)
                                            .map(key => getDatePosition(unit.dates[key]))
                                            .filter(p => p !== null);
                                        
                                        if (positions.length >= 2) {
                                            const minPos = Math.min(...positions);
                                            const maxPos = Math.max(...positions);
                                            return (
                                                <div 
                                                    className="gantt-duration-bar"
                                                    style={{
                                                        left: `${minPos}%`,
                                                        width: `${maxPos - minPos}%`
                                                    }}
                                                />
                                            );
                                        }
                                        return null;
                                    })()}
                                    
                                    {/* Milestone Markers */}
                                    {Object.entries(MILESTONES).map(([key, config]) => {
                                        const position = getDatePosition(unit.dates[key]);
                                        if (position === null) return null;
                                        
                                        return (
                                            <div
                                                key={key}
                                                className="gantt-milestone"
                                                style={{
                                                    left: `${position}%`,
                                                    backgroundColor: config.color
                                                }}
                                                title={`${config.label}: ${formatDate(unit.dates[key])}`}
                                            >
                                                <span className="gantt-milestone-icon">
                                                    {config.icon}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
            
            {/* Summary Footer */}
            <div className="gantt-summary">
                📋 {timelineUnits.length} Services angezeigt
            </div>
        </div>
    );
}

export default GanttTimeline;