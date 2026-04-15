import Resolver from '@forge/resolver';
import { handleGetLifecycleData } from './resolvers/lifecycle.js';
import { handleGetSettings, handleSaveSettings, handleGetAvailableFields, handleGetAvailableGroups, handleTestAssetsConnection } from './resolvers/settings.js';
import { handleDiscoverIssueFields, handleDiscoverAssetAttributes, handleInvalidateCache } from './resolvers/discovery.js';

const resolver = new Resolver();

resolver.define('getLifecycleData', handleGetLifecycleData);
resolver.define('getSettings', handleGetSettings);
resolver.define('saveSettings', handleSaveSettings);
resolver.define('getAvailableFields', handleGetAvailableFields);
resolver.define('getAvailableGroups', handleGetAvailableGroups);
resolver.define('testAssetsConnection', handleTestAssetsConnection);
resolver.define('discoverIssueFields', handleDiscoverIssueFields);
resolver.define('discoverAssetAttributes', handleDiscoverAssetAttributes);
resolver.define('invalidateCache', handleInvalidateCache);

export const handler = resolver.getDefinitions();
