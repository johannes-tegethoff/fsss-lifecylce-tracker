export const STAGE_COLORS = {
    DONE: 'green',
    LOST: 'red',
    PROGRESS: 'orange',
    OPEN: 'yellow',
    BLUE: 'blue',
    GRAY: 'gray'
};

const CLOSED_STATUSES = ['resolved', 'done', 'closed won'];
const LOST_STATUSES = ['closed lost'];
const ACTIVE_STATUSES = ['in progress', 'work in progress'];

/**
 * Determines the display status (color + label) for a pipeline stage.
 * @param {Object|null} stage - The stage data (offer, order, or epic)
 * @param {'issue'|'epic'} type - Stage type
 */
export function getStageStatus(stage, type) {
    if (!stage) return { status: 'empty', color: STAGE_COLORS.GRAY, label: '---' };

    if (type === 'issue') {
        const status = stage.status?.toLowerCase() || '';
        if (CLOSED_STATUSES.includes(status)) return { status: 'done',     color: STAGE_COLORS.DONE,     label: 'Done' };
        if (LOST_STATUSES.includes(status))   return { status: 'lost',     color: STAGE_COLORS.LOST,     label: 'Lost' };
        if (ACTIVE_STATUSES.includes(status)) return { status: 'progress', color: STAGE_COLORS.PROGRESS, label: 'In Progress' };
        return                                       { status: 'open',     color: STAGE_COLORS.OPEN,     label: 'Open' };
    }

    if (type === 'epic') {
        const progress = stage.data?.progress || 0;
        const epicStatus = stage.data?.status?.toLowerCase() || '';
        if (progress >= 100 || CLOSED_STATUSES.includes(epicStatus)) return { status: 'done',     color: STAGE_COLORS.DONE,     label: `${progress}%` };
        if (progress > 0)    return { status: 'progress', color: STAGE_COLORS.PROGRESS, label: `${progress}%` };
        return                      { status: 'open',     color: STAGE_COLORS.BLUE,     label: '0%' };
    }

    return { status: 'unknown', color: STAGE_COLORS.GRAY, label: '?' };
}
