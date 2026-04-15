import { MAX_PARALLEL_REQUESTS } from '../config.js';

/**
 * Processes a Jira API response into a standardized result object.
 * Handles common HTTP status codes with user-friendly messages.
 */
export async function processApiResponse(response, context = 'API request') {
    const status = response.status;

    if (response.ok) {
        try {
            const data = await response.json();
            return { ok: true, data, error: null, status };
        } catch {
            return { ok: true, data: null, error: null, status };
        }
    }

    let errorMessage;
    try {
        const errorBody = await response.json();
        errorMessage = errorBody.message || errorBody.errorMessages?.[0] || JSON.stringify(errorBody);
    } catch {
        errorMessage = await response.text().catch(() => 'Unknown error');
    }

    switch (status) {
        case 400: return { ok: false, data: null, error: `Invalid request: ${errorMessage}`, status };
        case 401: return { ok: false, data: null, error: 'Authentication required. Please log in again.', status };
        case 403: return { ok: false, data: null, error: `Access denied: ${errorMessage}`, status };
        case 404: return { ok: false, data: null, error: `${context} not found.`, status };
        case 429: return { ok: false, data: null, error: 'Too many requests. Please wait a moment.', status };
        case 500:
        case 502:
        case 503: return { ok: false, data: null, error: 'Jira server error. Please try again later.', status };
        default:  return { ok: false, data: null, error: `${context} failed: ${errorMessage} (${status})`, status };
    }
}

/**
 * Executes an array of async task functions in batches to limit parallelism.
 */
export async function executeBatched(tasks, batchSize = MAX_PARALLEL_REQUESTS) {
    const results = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(task => task().catch(error => ({ error: error.message })))
        );
        results.push(...batchResults);
    }
    return results;
}
