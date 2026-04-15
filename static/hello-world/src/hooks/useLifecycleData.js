import { useState, useCallback, useEffect } from 'react';
import { invoke, view } from '@forge/bridge';

/**
 * Fetches and manages lifecycle data from the Forge backend.
 * Handles loading state, error classification, site URL, and retry logic.
 */
export function useLifecycleData() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errorType, setErrorType] = useState(null);
    const [errorDetails, setErrorDetails] = useState(null);
    const [siteUrl, setSiteUrl] = useState('');
    const [retryCount, setRetryCount] = useState(0);

    const fetchData = useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        setErrorType(null);
        setErrorDetails(null);

        try {
            const context = await view.getContext();
            if (context.siteUrl) setSiteUrl(context.siteUrl);

            const result = await invoke('getLifecycleData', { projectKey: 'FSSS', forceRefresh });

            if (!context.siteUrl && result.siteUrl) setSiteUrl(result.siteUrl);

            if (result.error) {
                setError(result.error);
                setErrorType(result.errorType || 'UNKNOWN_ERROR');
                setErrorDetails(result.errorDetails || null);
                setData(result.customers?.length > 0 ? result : null);
            } else {
                setData(result);
                setError(null);
                setErrorType(null);
            }
        } catch (err) {
            console.error('[useLifecycleData] Error:', err);
            setError(err.message || 'Ein unerwarteter Fehler ist aufgetreten');
            setErrorType('UNKNOWN_ERROR');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleRetry = useCallback(() => {
        setRetryCount(prev => prev + 1);
        fetchData(false);
    }, [fetchData]);

    const handleRefresh = useCallback(() => {
        fetchData(true);
    }, [fetchData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, errorType, errorDetails, siteUrl, retryCount, handleRetry, handleRefresh };
}
