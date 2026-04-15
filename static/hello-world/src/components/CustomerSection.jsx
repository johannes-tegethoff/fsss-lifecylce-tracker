import React from 'react';
import { router } from '@forge/bridge';
import { UnitPipeline } from './UnitPipeline.jsx';
import { getStageStatus } from '../utils/stageStatus.js';

function getCustomerSummary(units) {
    const summary = { total: 0, yellow: 0, orange: 0, green: 0, gray: 0, blue: 0, completion: 0 };
    let totalProgress = 0;
    let progressCount = 0;

    units.forEach(unit => {
        [unit.offer, unit.offerEpic, unit.order, unit.orderEpic].forEach((stage, idx) => {
            const type = idx % 2 === 0 ? 'issue' : 'epic';
            const status = getStageStatus(stage, type);
            summary.total++;
            summary[status.color] = (summary[status.color] || 0) + 1;
            if (type === 'epic' && stage?.data?.progress !== undefined) {
                totalProgress += stage.data.progress;
                progressCount++;
            }
        });
    });

    summary.completion = progressCount > 0 ? Math.round(totalProgress / progressCount) : 0;
    return summary;
}

const BAR_COLORS = ['green', 'orange', 'yellow', 'blue', 'gray'];

/**
 * Renders a collapsible customer group with a summary bar and unit pipelines.
 */
export function CustomerSection({ customerData, siteUrl, expandedCustomers, expandedEpics, onToggleCustomer, onToggleEpic, onOpenIssue, filteredUnits }) {
    const { customer } = customerData;
    const isExpanded = expandedCustomers.has(customer.id);
    if (filteredUnits.length === 0) return null;

    const summary = getCustomerSummary(filteredUnits);

    return (
        <div key={customer.id} className="customer-section">
            <div className="customer-header" onClick={() => onToggleCustomer(customer.id)}>
                <span className="customer-toggle">{isExpanded ? '▼' : '▶'}</span>
                <h3 className="customer-name">
                    🏢
                    {siteUrl && customer.objectId ? (
                        <a
                            href="#"
                            className="asset-link"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.open(`${siteUrl}/jira/assets/object/${customer.objectId}`); }}
                        >
                            {customer.label}
                        </a>
                    ) : customer.label}
                </h3>

                <div className="customer-summary">
                    <div className="summary-bar">
                        {BAR_COLORS.map(color => summary[color] > 0 && (
                            <div
                                key={color}
                                className={`bar-segment bar-${color}`}
                                style={{ width: `${(summary[color] / summary.total) * 100}%` }}
                                title={`${summary[color]} ${color}`}
                            />
                        ))}
                    </div>
                    <span className="summary-completion">{summary.completion}%</span>
                </div>

                <span className="customer-count">({filteredUnits.length} Units)</span>
            </div>

            {isExpanded && (
                <div className="customer-units">
                    {filteredUnits.map(unit => (
                        <UnitPipeline
                            key={unit.unitKey}
                            unit={unit}
                            siteUrl={siteUrl}
                            expandedEpics={expandedEpics}
                            onToggleEpic={onToggleEpic}
                            onOpenIssue={onOpenIssue}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
