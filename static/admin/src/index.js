import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

import '@atlaskit/css-reset';

/**
 * Admin Settings Entry Point
 * 
 * This is the entry point for the Service Lifecycle Tracker admin page.
 * It renders the Admin App component which allows Jira administrators to
 * configure app settings like allowed groups and custom field mappings.
 */
ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById('root')
);