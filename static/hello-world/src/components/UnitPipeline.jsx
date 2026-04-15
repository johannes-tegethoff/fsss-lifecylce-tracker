import React from 'react';
import { router } from '@forge/bridge';
import { PipelineStage, PipelineArrow } from './PipelineStage.jsx';
import { formatDateShort } from '../utils/dates.js';

/**
 * Renders the full pipeline row for a single service unit.
 * Shows two rows: Offer → Offer Epic, and Order → Order Epic (or pending placeholder).
 */
export function UnitPipeline({ unit, siteUrl, expandedEpics, onToggleEpic, onOpenIssue }) {
    const unitAsset = unit.unitAsset;
    const hasAssetData = unitAsset?.fromAsset;

    const unitDisplayName = hasAssetData && (unitAsset.model || unitAsset.mw)
        ? `${unit.unitName} (${[unitAsset.model, unitAsset.mw ? `${unitAsset.mw} MW` : null].filter(Boolean).join(', ')})`
        : unit.unitName;

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
                <span className={`unit-name ${hasAssetData ? 'has-asset-data' : ''}`} title={unitTooltip}>
                    📦
                    {siteUrl && unitAsset?.objectId ? (
                        <a
                            href="#"
                            className="asset-link"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.open(`${siteUrl}/jira/assets/object/${unitAsset.objectId}`); }}
                        >
                            {unitDisplayName}
                        </a>
                    ) : unitDisplayName}
                    {hasAssetData && <span className="asset-badge" title="Daten aus JSM Asset">✓</span>}
                </span>

                <span className="unit-service">{unit.serviceType}</span>

                {unit.team && (
                    <span className="unit-team" title="Zugewiesenes Team">
                        👥 {unit.team}
                    </span>
                )}
                {unit.hasLegacyLinks && (
                    <span className="unit-legacy-badge" title="Dieser Service hat Links die noch migriert werden müssen">
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

            <div className="pipeline-rows">
                <div className="pipeline-stages">
                    <PipelineStage stage={unit.offer}     type="issue" label="OFFER"      siteUrl={siteUrl} expandedEpics={expandedEpics} onToggleEpic={onToggleEpic} onOpenIssue={onOpenIssue} />
                    <PipelineArrow />
                    <PipelineStage stage={unit.offerEpic} type="epic"  label="OFFER EPIC" siteUrl={siteUrl} expandedEpics={expandedEpics} onToggleEpic={onToggleEpic} onOpenIssue={onOpenIssue} />
                </div>

                {(unit.order || unit.orderEpic) ? (
                    <div className="pipeline-stages">
                        <PipelineStage stage={unit.order}     type="issue" label="ORDER"      siteUrl={siteUrl} expandedEpics={expandedEpics} onToggleEpic={onToggleEpic} onOpenIssue={onOpenIssue} />
                        <PipelineArrow />
                        <PipelineStage stage={unit.orderEpic} type="epic"  label="ORDER EPIC" siteUrl={siteUrl} expandedEpics={expandedEpics} onToggleEpic={onToggleEpic} onOpenIssue={onOpenIssue} />
                    </div>
                ) : (
                    <div className="pipeline-order-pending">
                        <span className="order-pending-dot" />
                        <span className="order-pending-line" />
                        <span className="order-pending-label">ORDER</span>
                        <span className="order-pending-text">Noch kein Auftrag angelegt</span>
                        <span className="order-pending-line" />
                        <span className="order-pending-dot" />
                        <span className="order-pending-line" />
                        <span className="order-pending-label">ORDER EPIC</span>
                    </div>
                )}
            </div>
        </div>
    );
}
