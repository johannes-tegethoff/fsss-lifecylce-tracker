import { useState } from 'react';
import { invoke } from '@forge/bridge';

/**
 * Manages field discovery and Asset attribute exploration state.
 * Used by the Developer Tools section in the Key Data view.
 */
export function useDiscovery() {
    const [discoveryKey, setDiscoveryKey] = useState('');
    const [discoveryResult, setDiscoveryResult] = useState(null);
    const [discoveryLoading, setDiscoveryLoading] = useState(false);
    const [discoveryError, setDiscoveryError] = useState(null);
    const [discoveryFilter, setDiscoveryFilter] = useState('');
    const [assetResults, setAssetResults] = useState({});
    const [assetLoading, setAssetLoading] = useState({});

    const runDiscovery = async () => {
        const key = discoveryKey.trim();
        if (!key) return;
        setDiscoveryLoading(true);
        setDiscoveryError(null);
        setDiscoveryResult(null);
        try {
            const result = await invoke('discoverIssueFields', { issueKey: key });
            if (result.error) {
                setDiscoveryError(`Fehler: ${result.error}`);
            } else {
                setDiscoveryResult(result);
            }
        } catch (err) {
            setDiscoveryError(err.message);
        } finally {
            setDiscoveryLoading(false);
        }
    };

    const runAssetDiscovery = async (workspaceId, objectId) => {
        setAssetLoading(prev => ({ ...prev, [objectId]: true }));
        try {
            const result = await invoke('discoverAssetAttributes', { workspaceId, objectId });
            setAssetResults(prev => ({ ...prev, [objectId]: result }));
        } catch (err) {
            setAssetResults(prev => ({ ...prev, [objectId]: { error: err.message } }));
        } finally {
            setAssetLoading(prev => ({ ...prev, [objectId]: false }));
        }
    };

    return {
        discoveryKey, setDiscoveryKey,
        discoveryResult,
        discoveryLoading,
        discoveryError,
        discoveryFilter, setDiscoveryFilter,
        assetResults,
        assetLoading,
        runDiscovery,
        runAssetDiscovery
    };
}
