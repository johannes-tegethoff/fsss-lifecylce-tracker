import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';
import './App.css';

// Material UI imports
import {
    Box,
    Container,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    CircularProgress,
    Alert,
    AlertTitle,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Typography,
    Chip,
    Card,
    CardContent,
    Link,
    Collapse,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Paper,
    Stack,
    Divider,
    LinearProgress,
} from '@mui/material';
import {
    ExpandMore as ExpandMoreIcon,
    CheckCircle as CheckCircleIcon,
    HourglassEmpty as HourglassIcon,
    RadioButtonUnchecked as OpenIcon,
    Business as BusinessIcon,
    Search as SearchIcon,
} from '@mui/icons-material';

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

    // Fetch lifecycle data on component mount
    useEffect(() => {
        setLoading(true);
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
        window.open(`/browse/${issueKey}`, '_blank');
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
                                    href={`/browse/${stage.key}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="stage-key-link"
                                    onClick={(e) => e.stopPropagation()}
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
                                        href={`/browse/${task.key}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="task-key-link"
                                        onClick={(e) => e.stopPropagation()}
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
        
        return (
            <Accordion 
                key={customer.id}
                expanded={isExpanded}
                onChange={() => toggleCustomer(customer.id)}
                sx={{ mb: 1.5 }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
                        <BusinessIcon sx={{ color: 'text.secondary' }} />
                        <Typography variant="h6" sx={{ flex: 1 }}>
                            {customer.label}
                        </Typography>
                        <Chip 
                            label={`${filteredUnits.length} Units`}
                            size="small"
                            color="primary"
                            variant="outlined"
                        />
                    </Stack>
                </AccordionSummary>
                <AccordionDetails>
                    <Stack spacing={1.5}>
                        {filteredUnits.map(renderUnitPipeline)}
                    </Stack>
                </AccordionDetails>
            </Accordion>
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
            <Card sx={{ height: '100%' }}>
                <CardContent>
                    <Typography variant="caption" color="text.secondary" gutterBottom>
                        {title}
                    </Typography>
                    <List dense>
                        {events.slice(0, 5).map((event, idx) => (
                            <ListItem key={idx} sx={{ px: 0 }}>
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    {typeColors[event.type] || '📅'}
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="body2" fontWeight="bold" color="primary">
                                                {formatDateShort(event.date)}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {event.label}
                                            </Typography>
                                        </Stack>
                                    }
                                    secondary={
                                        <Typography variant="caption" color="text.secondary">
                                            {event.customer} - {event.unit}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                        ))}
                    </List>
                    {events.length > 5 && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
                            +{events.length - 5} weitere
                        </Typography>
                    )}
                </CardContent>
            </Card>
        );
    };

    // Loading state
    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 8 }}>
                    <CircularProgress size={60} />
                    <Typography variant="body1" color="text.secondary">
                        Loading Service Lifecycle Data...
                    </Typography>
                </Box>
            </Container>
        );
    }

    // Error state
    if (error) {
        return (
            <Container maxWidth="lg" sx={{ py: 4 }}>
                <Alert severity="error">
                    <AlertTitle>Error Loading Data</AlertTitle>
                    {error}
                </Alert>
            </Container>
        );
    }

    const serviceTypes = getServiceTypes();

    return (
        <Container maxWidth="xl" sx={{ py: 2 }}>
            {/* Upcoming Events */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
                {renderUpcomingEvents(data.upcomingThisWeek, '📅 Diese Woche')}
                {renderUpcomingEvents(data.upcomingThisMonth, '📆 Dieser Monat')}
            </Box>

            {/* Filter Section */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                        fullWidth
                        placeholder="Suche nach Unit, Kunde..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                        }}
                        size="small"
                    />
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Status</InputLabel>
                        <Select
                            value={statusFilter}
                            label="Status"
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <MenuItem value="all">Alle Status</MenuItem>
                            <MenuItem value="open-offers">Offene Offers</MenuItem>
                            <MenuItem value="open-orders">Offene Orders</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Service</InputLabel>
                        <Select
                            value={serviceFilter}
                            label="Service"
                            onChange={(e) => setServiceFilter(e.target.value)}
                        >
                            <MenuItem value="all">Alle Services</MenuItem>
                            {serviceTypes.map(type => (
                                <MenuItem key={type} value={type}>{type}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
            </Paper>

            {/* Pipeline Legend */}
            <Paper sx={{ p: 1.5, mb: 2 }}>
                <Stack direction="row" spacing={3} justifyContent="center" flexWrap="wrap">
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'pipeline.yellow' }} />
                        <Typography variant="caption">Offen</Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'pipeline.orange' }} />
                        <Typography variant="caption">In Arbeit</Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'pipeline.green' }} />
                        <Typography variant="caption">Fertig</Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'pipeline.gray' }} />
                        <Typography variant="caption">Nicht vorhanden</Typography>
                    </Stack>
                </Stack>
            </Paper>

            {/* Customer List */}
            <Box>
                {data.customers.map(renderCustomer).filter(Boolean)}
            </Box>
        </Container>
    );
}

export default App;