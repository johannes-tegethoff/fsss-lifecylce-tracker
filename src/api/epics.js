import api, { route } from '@forge/api';

/**
 * Fetches an Epic issue together with all its child tasks.
 * Returns progress statistics and a task list (capped at 50).
 */
export async function fetchEpicWithTasks(epicKey) {
    try {
        const epicResponse = await api.asUser().requestJira(
            route`/rest/api/3/issue/${epicKey}?fields=status,summary,issuetype,fixVersions,project`
        );
        const epic = await epicResponse.json();

        const childJql = `"Epic Link" = ${epicKey} OR parent = ${epicKey}`;
        const childResponse = await api.asUser().requestJira(
            route`/rest/api/3/search/jql?jql=${childJql}&fields=status,summary,issuetype&maxResults=50`
        );
        const children = await childResponse.json();
        const tasks = children.issues || [];

        const doneStatuses = new Set(['done', 'resolved', 'closed', 'closed won', 'abgeschlossen', 'erledigt']);
        const doneTasks = tasks.filter(t => doneStatuses.has((t.fields?.status?.name || '').toLowerCase())).length;
        const totalTasks = tasks.length;
        const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

        console.log(`[fetchEpicWithTasks] ${epicKey}: ${doneTasks}/${totalTasks} done (${progress}%)`);

        return {
            key: epic.key,
            summary: epic.fields?.summary,
            status: epic.fields?.status?.name,
            project: epic.fields?.project?.key,
            fixVersions: (epic.fields?.fixVersions || []).map(v => v.name),
            progress,
            doneTasks,
            totalTasks,
            tasks: tasks.map(t => ({
                key: t.key,
                summary: t.fields?.summary,
                status: t.fields?.status?.name,
                type: t.fields?.issuetype?.name
            }))
        };
    } catch (error) {
        console.error(`[fetchEpicWithTasks] Error for ${epicKey}:`, error);
        return null;
    }
}
