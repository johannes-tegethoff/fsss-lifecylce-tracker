import React from 'react';
import { router } from '@forge/bridge';
import { useDiscovery } from '../hooks/useDiscovery.js';

/**
 * Renders the Key Data view: a table of offer metadata per unit,
 * plus a collapsible Developer Tools section for field discovery.
 */
export function KeyDataView({ data, siteUrl, sortCustomers, filterUnits }) {
    const {
        discoveryKey, setDiscoveryKey,
        discoveryResult, discoveryLoading, discoveryError,
        discoveryFilter, setDiscoveryFilter,
        assetResults, assetLoading,
        runDiscovery, runAssetDiscovery
    } = useDiscovery();

    return (
        <div className="keydata-view">
            {/* Main Key Data Table */}
            <div className="keydata-main-table-wrap">
                <table className="keydata-main-table">
                    <thead>
                        <tr>
                            <th>Kunde</th>
                            <th>Unit</th>
                            <th>Typ</th>
                            <th>MW</th>
                            <th>OEM</th>
                            <th>Modell</th>
                            <th>Offer</th>
                            <th>Servicenummer</th>
                            <th>Offer Type</th>
                            <th>Outage Type</th>
                            <th>Region</th>
                            <th>Sprache</th>
                            <th>LTP</th>
                            <th>Organisation</th>
                            <th>Parallel Works</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortCustomers(data.customers).flatMap(({ customer, units }) => {
                            const visibleUnits = filterUnits(units);
                            return visibleUnits.map((unit, idx) => {
                                const kd = unit.keyData;
                                return (
                                    <tr key={unit.unitKey} className={idx === 0 ? 'kd-first-unit' : ''}>
                                        {idx === 0 && (
                                            <td className="kd-customer-cell" rowSpan={visibleUnits.length}>
                                                {siteUrl && customer.objectId ? (
                                                    <a href="#" className="asset-link" onClick={(e) => { e.preventDefault(); router.open(`${siteUrl}/jira/assets/object/${customer.objectId}`); }}>
                                                        {customer.label}
                                                    </a>
                                                ) : customer.label}
                                            </td>
                                        )}
                                        <td className="kd-unit-cell">
                                            {siteUrl && unit.unitAsset?.objectId ? (
                                                <a href="#" className="asset-link" onClick={(e) => { e.preventDefault(); router.open(`${siteUrl}/jira/assets/object/${unit.unitAsset.objectId}`); }}>
                                                    {unit.unitName}
                                                </a>
                                            ) : unit.unitName}
                                            <span className="kd-service-badge">{unit.serviceType}</span>
                                        </td>
                                        <td className="kd-cell">{unit.unitAsset?.attributes?.['Type'] || '—'}</td>
                                        <td className="kd-cell kd-mono">{unit.unitAsset?.mw != null ? `${unit.unitAsset.mw} MW` : '—'}</td>
                                        <td className="kd-cell">{unit.unitAsset?.oem || '—'}</td>
                                        <td className="kd-cell">{unit.unitAsset?.model || '—'}</td>
                                        <td className="kd-cell">
                                            {unit.offer?.key ? (
                                                <a href="#" className="stage-key-link" onClick={(e) => { e.preventDefault(); router.open(`${siteUrl}/browse/${unit.offer.key}`); }}>
                                                    {unit.offer.key}
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td className="kd-cell kd-mono">{kd?.servicenumber || '—'}</td>
                                        <td className="kd-cell">{kd?.offerType || '—'}</td>
                                        <td className="kd-cell">{kd?.outageType || '—'}</td>
                                        <td className="kd-cell">{kd?.region || '—'}</td>
                                        <td className="kd-cell">{kd?.language || '—'}</td>
                                        <td className="kd-cell kd-badge">
                                            {kd?.ltp ? <span className={`kd-ltp kd-ltp-${kd.ltp.toLowerCase()}`}>{kd.ltp}</span> : '—'}
                                        </td>
                                        <td className="kd-cell">{kd?.organizations || '—'}</td>
                                        <td className="kd-cell">{kd?.parallelWorks || '—'}</td>
                                    </tr>
                                );
                            });
                        })}
                    </tbody>
                </table>
            </div>

            {/* Developer Tools */}
            <details className="keydata-devtools">
                <summary className="keydata-devtools-summary">🔧 Developer Tools (Field Discovery)</summary>
                <div className="keydata-devtools-body">
                    <div className="keydata-discovery-panel">
                        <h3 className="keydata-discovery-title">🔍 Field Discovery</h3>
                        <p className="keydata-discovery-desc">
                            Ticket-Key eingeben um alle Custom Fields und Werte zu sehen. Für Zuordnung neuer Felder.
                        </p>
                        <div className="keydata-discovery-input-row">
                            <input
                                type="text"
                                className="keydata-issue-input"
                                placeholder="z.B. FSSS-620"
                                value={discoveryKey}
                                onChange={(e) => setDiscoveryKey(e.target.value.toUpperCase())}
                                onKeyDown={(e) => { if (e.key === 'Enter' && discoveryKey.trim()) runDiscovery(); }}
                            />
                            <button
                                className="keydata-discover-btn"
                                disabled={!discoveryKey.trim() || discoveryLoading}
                                onClick={runDiscovery}
                            >
                                {discoveryLoading ? '⏳ Lädt...' : 'Analysieren'}
                            </button>
                        </div>
                        {discoveryError && <div className="keydata-error">{discoveryError}</div>}
                    </div>

                    {discoveryResult && (
                        <div className="keydata-results">
                            <div className="keydata-results-header">
                                <div className="keydata-results-meta">
                                    <strong>{discoveryResult.issueKey}</strong>
                                    <span className="keydata-issuetype">{discoveryResult.issueType}</span>
                                    <span className="keydata-summary">{discoveryResult.summary}</span>
                                </div>
                                <div className="keydata-results-count">{discoveryResult.fields.length} Felder gefunden</div>
                            </div>
                            <div className="keydata-filter-row">
                                <input
                                    type="text"
                                    className="keydata-filter-input"
                                    placeholder="Filtern nach Name oder ID..."
                                    value={discoveryFilter}
                                    onChange={(e) => setDiscoveryFilter(e.target.value)}
                                />
                            </div>
                            <table className="keydata-table">
                                <thead><tr><th>Field ID</th><th>Name</th><th>Typ</th><th>Wert</th></tr></thead>
                                <tbody>
                                    {discoveryResult.fields
                                        .filter(f => {
                                            if (!discoveryFilter) return true;
                                            const q = discoveryFilter.toLowerCase();
                                            return f.id.toLowerCase().includes(q) || f.name.toLowerCase().includes(q);
                                        })
                                        .map(f => (
                                            <tr key={f.id} className={f.isCustom ? 'row-custom' : 'row-standard'}>
                                                <td className="field-id"><code>{f.id}</code></td>
                                                <td className="field-name">{f.name}</td>
                                                <td className="field-type">{f.customType?.split(':').pop() || f.type}</td>
                                                <td className="field-value">{f.displayValue}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {discoveryResult?.assetRefs?.length > 0 && (
                        <div className="keydata-asset-explorer">
                            <h3 className="keydata-discovery-title">🗄️ Asset Explorer</h3>
                            <div className="asset-explorer-list">
                                {discoveryResult.assetRefs.map(ref => {
                                    const res = assetResults[ref.objectId];
                                    const isLoading = assetLoading[ref.objectId];
                                    return (
                                        <div key={ref.objectId} className="asset-explorer-item">
                                            <div className="asset-explorer-header">
                                                <div className="asset-explorer-meta">
                                                    <span className="asset-explorer-field">{ref.fieldName}</span>
                                                    <code className="asset-explorer-id">objectId: {ref.objectId}</code>
                                                </div>
                                                <button
                                                    className="keydata-discover-btn asset-load-btn"
                                                    disabled={isLoading}
                                                    onClick={() => runAssetDiscovery(ref.workspaceId, ref.objectId)}
                                                >
                                                    {isLoading ? '⏳ Lädt...' : res ? '↻ Neu laden' : 'Attribute laden'}
                                                </button>
                                            </div>
                                            {res?.error && <div className="keydata-error">{res.error}</div>}
                                            {res && !res.error && (
                                                <>
                                                    <div className="asset-explorer-object-info">
                                                        <strong>{res.label}</strong>
                                                        <span className="keydata-issuetype">{res.objectType}</span>
                                                        <span className="keydata-summary">{res.objectKey}</span>
                                                        <span className="keydata-results-count">{res.attributes.length} Attribute</span>
                                                    </div>
                                                    <table className="keydata-table asset-attr-table">
                                                        <thead><tr><th>Attr ID</th><th>Name</th><th>Typ</th><th>Wert</th></tr></thead>
                                                        <tbody>
                                                            {res.attributes.map(attr => (
                                                                <tr key={attr.id}>
                                                                    <td className="field-id"><code>{attr.id}</code></td>
                                                                    <td className="field-name">{attr.name}</td>
                                                                    <td className="field-type">{attr.type}</td>
                                                                    <td className="field-value">{attr.value}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </details>
        </div>
    );
}
