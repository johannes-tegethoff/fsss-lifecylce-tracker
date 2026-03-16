import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import './App.css';

/**
 * Service Lifecycle Tracker - Admin Settings
 * 
 * This admin page allows Jira administrators to configure:
 * 1. Allowed Groups - Which Jira groups can access the app
 * 2. Custom Field Mappings - Map date fields to Jira custom fields (future)
 * 
 * Settings are stored in Forge Key-Value Storage and persist across deployments.
 */
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
        projectKey: 'FSSS'
    });
    
    // Available groups from Jira (for selection)
    const [availableGroups, setAvailableGroups] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    
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
                projectKey: result.projectKey || 'FSSS'
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
    
    // Load data on mount
    useEffect(() => {
        loadSettings();
        loadAvailableGroups();
    }, [loadSettings, loadAvailableGroups]);

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