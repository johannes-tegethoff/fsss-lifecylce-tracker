import React from 'react';
import { router } from '@forge/bridge';
import { getStageStatus } from '../utils/stageStatus.js';

const STATUS_EMOJI = {
    green:  '✓',
    orange: '⏳',
    yellow: '○',
    blue:   '◐',
    red:    '✗',
    gray:   '—',
};

function StageLozenge({ color, label }) {
    const emoji = STATUS_EMOJI[color] || '—';
    return (
        <span className={`stage-lozenge lozenge-${color}`}>
            {emoji} {label}
        </span>
    );
}

function TaskStatusIcon({ status }) {
    if (status === 'Done') {
        return <span className="task-status-icon">✅</span>;
    }
    if (status === 'In Progress') {
        return <span className="task-status-icon">⏳</span>;
    }
    return <span className="task-status-icon">○</span>;
}

function EpicTasks({ stage, siteUrl }) {
    return (
        <div className="epic-tasks">
            <div className="epic-tasks-header">
                Tasks ({stage.data.doneTasks}/{stage.data.totalTasks})
            </div>
            {stage.data.tasks.slice(0, 10).map(task => (
                <div key={task.key} className="epic-task-item">
                    <TaskStatusIcon status={task.status} />
                    <a
                        href="#"
                        className="task-key-link"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.open(`${siteUrl}/browse/${task.key}`); }}
                    >
                        {task.key}
                    </a>
                    <span className="task-summary">{task.summary}</span>
                </div>
            ))}
            {stage.data.tasks.length > 10 && (
                <div className="epic-tasks-more">+{stage.data.tasks.length - 10} weitere Tasks</div>
            )}
        </div>
    );
}

/**
 * Renders a single pipeline stage (Offer, Order, Offer Epic, or Order Epic).
 * Handles click behavior: Epics expand/collapse, Issues open in Jira.
 */
export function PipelineStage({ stage, type, label, siteUrl, expandedEpics, onToggleEpic, onOpenIssue }) {
    const stageStatus = getStageStatus(stage, type);
    const hasData = stage !== null && stage !== undefined;
    const isEpic = type === 'epic';
    const isExpanded = isEpic && hasData && expandedEpics.has(stage.key);

    function handleClick(e) {
        if (!hasData || !stage.key) return;
        if (isEpic) {
            onToggleEpic(stage.key, e);
        } else {
            onOpenIssue(stage.key);
        }
    }

    return (
        <div className="pipeline-stage-wrapper">
            <div
                className={`pipeline-stage stage-${stageStatus.color} ${hasData ? 'clickable' : ''}`}
                onClick={handleClick}
                title={hasData ? `${stage.key}: ${stage.summary || stage.data?.summary || ''}` : 'Not available'}
            >
                <div className="stage-label">{label}</div>
                <div className="stage-content">
                    {hasData ? (
                        <>
                            <a
                                href="#"
                                className="stage-key-link"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.open(`${siteUrl}/browse/${stage.key}`); }}
                            >
                                {stage.key}
                            </a>
                            {isEpic && stage.data && (
                                <div className="stage-progress-container">
                                    <div className="stage-progress">
                                        <div className="progress-fill" style={{ width: `${stage.data.progress || 0}%` }} />
                                    </div>
                                    <span className="stage-tasks-count">
                                        {stage.data.doneTasks}/{stage.data.totalTasks}
                                    </span>
                                </div>
                            )}
                            <div className="stage-status">
                                <StageLozenge color={stageStatus.color} label={stageStatus.label} />
                                {isEpic && stage.data?.tasks?.length > 0 && (
                                    <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="stage-empty">---</div>
                    )}
                </div>
            </div>

            {isEpic && hasData && isExpanded && stage.data?.tasks && (
                <EpicTasks stage={stage} siteUrl={siteUrl} />
            )}
        </div>
    );
}

export function PipelineArrow() {
    return <div className="pipeline-arrow">▶</div>;
}
