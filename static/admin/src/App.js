import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import './App.css';

/**
 * Service Lifecycle Tracker - Admin Settings
 * 
 * This admin page allows Jira administrators to configure:
 * 1. Allowed Groups - Which Jira groups can access the app
 * 2. Custom Field Mappings - Map date fields to Jira custom fields
 * 3. Cache Settings - Control data caching behavior
 * 
 * Settings are stored in Forge Key-Value Storage and persist across deployments.
 */

/**
 * Default field mappings - these match the FSSS project configuration.
 * Can be overridden for other Jira instances.
 */
const DEFAULT_FIELD_MAPPINGS = {
    // Date fields
    stopOfUnit: 'customfield_10147',
    overhaulStart: 'customfield_10148',
    overhaulEnd: 'customfield_10149',
    startOfCommissioning: 'customfield_10150',
    // Team field
    team: 'customfield_10001',
    // Asset reference fields (JSM Assets)
    customerAsset: 'customfield_10246',
    unitAsset: 'customfield_10245'
};
function App() {
    // =========================================================================
    // STATE
    // =========================================================================
    
    // Loading and error states
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    
    // Settings data
    const [settings, setSettings] = useState({
        allowedGroups: [],
        restrictAccess: false,
        projectKey: 'FSSS',
        fieldMappings: DEFAULT_FIELD_MAPPINGS,
        cacheEnabled: true
    });
    
    // Available groups from Jira (for selection)
    const [availableGroups, setAvailableGroups] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    
    // Available custom fields from Jira
    const [availableFields, setAvailableFields] = useState({
        dateFields: [],
        teamFields: [],
        all: []
    });
    const [loadingFields, setLoadingFields] = useState(false);
    
    // Cache invalidation state
    const [invalidatingCache, setInvalidatingCache] = useState(false);
    
    // New group input
    const [newGroupName, setNewGroupName] = useState('');

    // =========================================================================
    // DATA FETCHING
    // =========================================================================
    
    /**
     * Load current settings from Forge Storage
     */
    const loadSettings = useCallback(async () => {
        setLoading(true);
        setError(null);
        
        try {
            console.log('[Admin] Loading settings...');
            const result = await invoke('getSettings');
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            console.log('[Admin] Settings loaded:', result);
            setSettings({
                allowedGroups: result.allowedGroups || [],
                restrictAccess: result.restrictAccess ?? false,
                projectKey: result.projectKey || 'FSSS',
                fieldMappings: result.fieldMappings || DEFAULT_FIELD_MAPPINGS,
                cacheEnabled: result.cacheEnabled !== false
            });
        } catch (err) {
            console.error('[Admin] Error loading settings:', err);
            setError('Fehler beim Laden der Einstellungen: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, []);
    
    /**
     * Load available Jira groups for selection
     */
    const loadAvailableGroups = useCallback(async () => {
        setLoadingGroups(true);
        
        try {
            console.log('[Admin] Loading available groups...');
            const result = await invoke('getAvailableGroups');
            
            if (result.error) {
                console.warn('[Admin] Could not load groups:', result.error);
                return;
            }
            
            console.log('[Admin] Available groups:', result.groups);
            setAvailableGroups(result.groups || []);
        } catch (err) {
            console.error('[Admin] Error loading groups:', err);
        } finally {
            setLoadingGroups(false);
        }
    }, []);
    
    /**
     * Load available Jira custom fields for field mapping
     */
    const loadAvailableFields = useCallback(async () => {
        setLoadingFields(true);
        
        try {
            console.log('[Admin] Loading available fields...');
            const result = await invoke('getAvailableFields');
            
            if (result.error) {
                console.warn('[Admin] Could not load fields:', result.error);
                return;
            }
            
            console.log('[Admin] Available fields:', result);
            setAvailableFields({
                dateFields: result.dateFields || [],
                teamFields: result.teamFields || [],
                all: result.fields || []
            });
        } catch (err) {
            console.error('[Admin] Error loading fields:', err);
        } finally {
            setLoadingFields(false);
        }
    }, []);
    
    // Load data on mount
    useEffect(() => {
        loadSettings();
        loadAvailableGroups();
        loadAvailableFields();
    }, [loadSettings, loadAvailableGroups, loadAvailableFields]);

    // =========================================================================
    // SAVE SETTINGS
    // =========================================================================
    
    /**
     * Save settings to Forge Storage
     */
    const saveSettings = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);
        
        try {
            console.log('[Admin] Saving settings:', settings);
            const result = await invoke('saveSettings', { settings });
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            console.log('[Admin] Settings saved successfully');
            setSuccessMessage('Einstellungen erfolgreich gespeichert!');
            
            // Clear success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            console.error('[Admin] Error saving settings:', err);
            setError('Fehler beim Speichern: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // =========================================================================
    // GROUP MANAGEMENT
    // =========================================================================
    
    /**
     * Add a group to the allowed list
     */
    const addGroup = (groupName) => {
        if (!groupName || groupName.trim() === '') return;
        
        const trimmedName = groupName.trim();
        
        // Check if already added
        if (settings.allowedGroups.includes(trimmedName)) {
            setError(`Gruppe "${trimmedName}" ist bereits hinzugefügt.`);
            setTimeout(() => setError(null), 3000);
            return;
        }
        
        setSettings(prev => ({
            ...prev,
            allowedGroups: [...prev.allowedGroups, trimmedName]
        }));
        
        setNewGroupName('');
    };
    
    /**
     * Remove a group from the allowed list
     */
    const removeGroup = (groupName) => {
        setSettings(prev => ({
            ...prev,
            allowedGroups: prev.allowedGroups.filter(g => g !== groupName)
        }));
    };
    
    /**
     * Toggle access restriction on/off
     */
    const toggleRestriction = () => {
        setSettings(prev => ({
            ...prev,
            restrictAccess: !prev.restrictAccess
        }));
    };
    
    /**
     * Toggle cache on/off
     */
    const toggleCache = () => {
        setSettings(prev => ({
            ...prev,
            cacheEnabled: !prev.cacheEnabled
        }));
    };
    
    /**
     * Update a field mapping
     */
    const updateFieldMapping = (fieldKey, fieldId) => {
        setSettings(prev => ({
            ...prev,
            fieldMappings: {
                ...prev.fieldMappings,
                [fieldKey]: fieldId
            }
        }));
    };
    
    /**
     * Invalidate the data cache
     */
    const handleInvalidateCache = async () => {
        setInvalidatingCache(true);
        
        try {
            const result = await invoke('invalidateCache');
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            setSuccessMessage('Cache wurde erfolgreich geleert!');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError('Fehler beim Leeren des Caches: ' + err.message);
        } finally {
            setInvalidatingCache(false);
        }
    };
    
    /**
     * Render a field mapping selector
     */
    const renderFieldSelector = (label, fieldKey, hint, fieldOptions) => {
        const currentValue = settings.fieldMappings?.[fieldKey] || '';
        
        return (
            <div className="setting-row">
                <div className="setting-label">
                    <strong>{label}</strong>
                    <span className="setting-hint">{hint}</span>
                </div>
                <div className="setting-control">
                    <select
                        className="field-select"
                        value={currentValue}
                        onChange={(e) => updateFieldMapping(fieldKey, e.target.value)}
                    >
                        <option value="">-- Feld auswählen --</option>
                        {fieldOptions.map(field => (
                            <option key={field.id} value={field.id}>
                                {field.name} ({field.id})
                            </option>
                        ))}
                    </select>
                    {currentValue && (
                        <span className="field-id-display">{currentValue}</span>
                    )}
                </div>
            </div>
        );
    };

    // =========================================================================
    // RENDER
    // =========================================================================
    
    // Loading state
    if (loading) {
        return (
            <div className="admin-app">
                <div className="admin-loading">
                    <div className="spinner"></div>
                    <p>Einstellungen werden geladen...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="admin-app">
            {/* Header */}
            <header className="admin-header">
                <h1>⚙️ Service Lifecycle Tracker</h1>
                <p className="admin-subtitle">Administrationseinstellungen</p>
            </header>
            
            {/* Messages */}
            {error && (
                <div className="admin-message error">
                    <span className="message-icon">❌</span>
                    <span className="message-text">{error}</span>
                    <button className="message-dismiss" onClick={() => setError(null)}>×</button>
                </div>
            )}
            
            {successMessage && (
                <div className="admin-message success">
                    <span className="message-icon">✅</span>
                    <span className="message-text">{successMessage}</span>
                </div>
            )}
            
            {/* Settings Sections */}
            <div className="admin-content">
                
                {/* Access Control Section */}
                <section className="admin-section">
                    <div className="section-header">
                        <h2>🔐 Zugriffskontrolle</h2>
                        <p className="section-description">
                            Legen Sie fest, welche Jira-Gruppen auf die App zugreifen dürfen.
                        </p>
                    </div>
                    
                    <div className="section-content">
                        {/* Enable/Disable Toggle */}
                        <div className="setting-row">
                            <div className="setting-label">
                                <strong>Zugriff einschränken</strong>
                                <span className="setting-hint">
                                    Wenn aktiviert, können nur Mitglieder der unten aufgeführten Gruppen die App nutzen.
                                </span>
                            </div>
                            <div className="setting-control">
                                <button 
                                    className={`toggle-btn ${settings.restrictAccess ? 'active' : ''}`}
                                    onClick={toggleRestriction}
                                    aria-pressed={settings.restrictAccess}
                                >
                                    <span className="toggle-track">
                                        <span className="toggle-thumb"></span>
                                    </span>
                                    <span className="toggle-label">
                                        {settings.restrictAccess ? 'Aktiv' : 'Inaktiv'}
                                    </span>
                                </button>
                            </div>
                        </div>
                        
                        {/* Groups List (only shown when restriction is enabled) */}
                        {settings.restrictAccess && (
                            <div className="groups-section">
                                <h3>Berechtigte Gruppen</h3>
                                
                                {/* Current Groups */}
                                <div className="groups-list">
                                    {settings.allowedGroups.length === 0 ? (
                                        <div className="groups-empty">
                                            <span>⚠️</span>
                                            <p>Keine Gruppen konfiguriert. Niemand kann die App nutzen!</p>
                                        </div>
                                    ) : (
                                        settings.allowedGroups.map(group => (
                                            <div key={group} className="group-item">
                                                <span className="group-icon">👥</span>
                                                <span className="group-name">{group}</span>
                                                <button 
                                                    className="group-remove"
                                                    onClick={() => removeGroup(group)}
                                                    title="Gruppe entfernen"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                                
                                {/* Add Group */}
                                <div className="add-group">
                                    <div className="add-group-input-row">
                                        <input
                                            type="text"
                                            className="add-group-input"
                                            placeholder="Gruppenname eingeben..."
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    addGroup(newGroupName);
                                                }
                                            }}
                                        />
                                        <button 
                                            className="add-group-btn"
                                            onClick={() => addGroup(newGroupName)}
                                            disabled={!newGroupName.trim()}
                                        >
                                            + Hinzufügen
                                        </button>
                                    </div>
                                    
                                    {/* Quick-add from available groups */}
                                    {availableGroups.length > 0 && (
                                        <div className="available-groups">
                                            <span className="available-groups-label">Verfügbare Gruppen:</span>
                                            <div className="available-groups-list">
                                                {loadingGroups ? (
                                                    <span className="loading-text">Lade...</span>
                                                ) : (
                                                    availableGroups
                                                        .filter(g => !settings.allowedGroups.includes(g.name))
                                                        .slice(0, 10)
                                                        .map(group => (
                                                            <button
                                                                key={group.name}
                                                                className="available-group-btn"
                                                                onClick={() => addGroup(group.name)}
                                                                title={`${group.name} hinzufügen`}
                                                            >
                                                                + {group.name}
                                                            </button>
                                                        ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
                
                {/* Project Configuration Section */}
                <section className="admin-section">
                    <div className="section-header">
                        <h2>📁 Projekt-Konfiguration</h2>
                        <p className="section-description">
                            Konfigurieren Sie das Jira-Projekt für den Service Lifecycle Tracker.
                        </p>
                    </div>
                    
                    <div className="section-content">
                        <div className="setting-row">
                            <div className="setting-label">
                                <strong>Projekt-Key</strong>
                                <span className="setting-hint">
                                    Das Jira-Projekt, aus dem Offers und Orders geladen werden.
                                </span>
                            </div>
                            <div className="setting-control">
                                <input
                                    type="text"
                                    className="project-key-input"
                                    value={settings.projectKey}
                                    onChange={(e) => setSettings(prev => ({
                                        ...prev,
                                        projectKey: e.target.value.toUpperCase()
                                    }))}
                                    placeholder="z.B. FSSS"
                                    maxLength={10}
                                />
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Field Mappings Section */}
                <section className="admin-section">
                    <div className="section-header">
                        <h2>🔗 Feld-Zuordnungen</h2>
                        <p className="section-description">
                            Ordnen Sie die Custom Fields aus Ihrem Jira-Projekt den App-Feldern zu.
                            {loadingFields && <span className="loading-inline"> Lade Felder...</span>}
                        </p>
                    </div>
                    
                    <div className="section-content">
                        <div className="field-mappings-grid">
                            <h3>📅 Datums-Felder</h3>
                            
                            {renderFieldSelector(
                                'Stop of Unit',
                                'stopOfUnit',
                                'Das Datum, an dem die Einheit stillgelegt wird.',
                                availableFields.dateFields
                            )}
                            
                            {renderFieldSelector(
                                'Overhaul Start',
                                'overhaulStart',
                                'Das Startdatum der Überholung.',
                                availableFields.dateFields
                            )}
                            
                            {renderFieldSelector(
                                'Overhaul End',
                                'overhaulEnd',
                                'Das Enddatum der Überholung.',
                                availableFields.dateFields
                            )}
                            
                            {renderFieldSelector(
                                'Start of Commissioning',
                                'startOfCommissioning',
                                'Das Datum der Inbetriebnahme.',
                                availableFields.dateFields
                            )}
                            
                            <h3>👥 Team-Feld</h3>
                            
                            {renderFieldSelector(
                                'Team',
                                'team',
                                'Das Feld, das das zuständige Team enthält.',
                                availableFields.teamFields.length > 0 ? availableFields.teamFields : availableFields.all
                            )}
                            
                            <h3>🏢 Asset-Felder (JSM Assets)</h3>
                            <p className="section-note">
                                Diese Felder verknüpfen Issues mit JSM Assets für Kunden- und Unit-Daten.
                            </p>
                            
                            {renderFieldSelector(
                                'Customer Asset',
                                'customerAsset',
                                'Das Asset-Feld, das den Kunden referenziert.',
                                availableFields.all.filter(f => 
                                    f.type === 'array' || 
                                    f.customType?.includes('assets') ||
                                    f.customType?.includes('cmdb') ||
                                    f.name?.toLowerCase().includes('customer') ||
                                    f.name?.toLowerCase().includes('asset')
                                ).length > 0 
                                    ? availableFields.all.filter(f => 
                                        f.type === 'array' || 
                                        f.customType?.includes('assets') ||
                                        f.customType?.includes('cmdb') ||
                                        f.name?.toLowerCase().includes('customer') ||
                                        f.name?.toLowerCase().includes('asset')
                                    )
                                    : availableFields.all
                            )}
                            
                            {renderFieldSelector(
                                'Unit Asset',
                                'unitAsset',
                                'Das Asset-Feld, das die Unit (Turbine/Generator) referenziert.',
                                availableFields.all.filter(f => 
                                    f.type === 'array' || 
                                    f.customType?.includes('assets') ||
                                    f.customType?.includes('cmdb') ||
                                    f.name?.toLowerCase().includes('unit') ||
                                    f.name?.toLowerCase().includes('asset')
                                ).length > 0 
                                    ? availableFields.all.filter(f => 
                                        f.type === 'array' || 
                                        f.customType?.includes('assets') ||
                                        f.customType?.includes('cmdb') ||
                                        f.name?.toLowerCase().includes('unit') ||
                                        f.name?.toLowerCase().includes('asset')
                                    )
                                    : availableFields.all
                            )}
                        </div>
                        
                        {/* Manual Field ID Input */}
                        <div className="manual-field-input">
                            <p className="manual-hint">
                                💡 <strong>Tipp:</strong> Wenn ein Feld nicht in der Liste erscheint, 
                                können Sie die Field-ID manuell eingeben (z.B. "customfield_10147").
                            </p>
                        </div>
                    </div>
                </section>
                
                {/* Cache Settings Section */}
                <section className="admin-section">
                    <div className="section-header">
                        <h2>⚡ Performance & Cache</h2>
                        <p className="section-description">
                            Steuern Sie das Caching-Verhalten für bessere Performance.
                        </p>
                    </div>
                    
                    <div className="section-content">
                        <div className="setting-row">
                            <div className="setting-label">
                                <strong>Daten-Caching</strong>
                                <span className="setting-hint">
                                    Wenn aktiviert, werden Daten für 5 Minuten zwischengespeichert.
                                    Dies verbessert die Ladezeit erheblich.
                                </span>
                            </div>
                            <div className="setting-control">
                                <button 
                                    className={`toggle-btn ${settings.cacheEnabled ? 'active' : ''}`}
                                    onClick={toggleCache}
                                    aria-pressed={settings.cacheEnabled}
                                >
                                    <span className="toggle-track">
                                        <span className="toggle-thumb"></span>
                                    </span>
                                    <span className="toggle-label">
                                        {settings.cacheEnabled ? 'Aktiv' : 'Inaktiv'}
                                    </span>
                                </button>
                            </div>
                        </div>
                        
                        <div className="setting-row">
                            <div className="setting-label">
                                <strong>Cache leeren</strong>
                                <span className="setting-hint">
                                    Löscht alle zwischengespeicherten Daten. Nützlich nach Änderungen in Jira.
                                </span>
                            </div>
                            <div className="setting-control">
                                <button 
                                    className="cache-clear-btn"
                                    onClick={handleInvalidateCache}
                                    disabled={invalidatingCache}
                                >
                                    {invalidatingCache ? (
                                        <>
                                            <span className="spinner-small"></span>
                                            Wird geleert...
                                        </>
                                    ) : (
                                        '🗑️ Cache leeren'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Info Section */}
                <section className="admin-section info-section">
                    <div className="info-box">
                        <h3>ℹ️ Hinweise</h3>
                        <ul>
                            <li>
                                <strong>Zugriffskontrolle:</strong> Wenn aktiviert, werden Benutzer beim Öffnen der App 
                                gegen die konfigurierten Gruppen geprüft.
                            </li>
                            <li>
                                <strong>Gruppen:</strong> Verwenden Sie die exakten Gruppennamen aus Jira 
                                (z.B. "jira-software-users", "service-lifecycle-admins").
                            </li>
                            <li>
                                <strong>Projekt-Key:</strong> Muss ein gültiger Jira-Projekt-Key sein 
                                (Großbuchstaben und Zahlen, z.B. "FSSS", "PROJ1").
                            </li>
                            <li>
                                <strong>Feld-Zuordnungen:</strong> Wählen Sie die Custom Fields aus Ihrem 
                                Jira-Projekt aus. Die Field-IDs haben das Format "customfield_XXXXX".
                            </li>
                            <li>
                                <strong>Asset-Felder:</strong> Die Customer- und Unit-Felder müssen auf 
                                JSM Assets Custom Fields zeigen, die Asset-Objekte referenzieren. 
                                Die App lädt dann die vollständigen Asset-Attribute (Name, Seriennummer, etc.).
                            </li>
                            <li>
                                <strong>Cache:</strong> Aktiviertes Caching reduziert API-Aufrufe und 
                                beschleunigt das Laden. Der Cache wird automatisch nach 5 Minuten erneuert.
                            </li>
                        </ul>
                    </div>
                </section>
            </div>
            
            {/* Save Button */}
            <footer className="admin-footer">
                <button 
                    className="save-btn"
                    onClick={saveSettings}
                    disabled={saving}
                >
                    {saving ? (
                        <>
                            <span className="spinner-small"></span>
                            Wird gespeichert...
                        </>
                    ) : (
                        <>
                            💾 Einstellungen speichern
                        </>
                    )}
                </button>
            </footer>
        </div>
    );
}

export default App;