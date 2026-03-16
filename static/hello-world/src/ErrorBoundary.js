import React from 'react';

/**
 * ErrorBoundary Component
 * 
 * A React Error Boundary that catches JavaScript errors anywhere in the child
 * component tree, logs those errors, and displays a fallback UI instead of
 * crashing the whole application.
 * 
 * Usage:
 *   <ErrorBoundary>
 *     <YourComponent />
 *   </ErrorBoundary>
 * 
 * With custom fallback:
 *   <ErrorBoundary fallback={<CustomErrorUI />}>
 *     <YourComponent />
 *   </ErrorBoundary>
 * 
 * With reset callback:
 *   <ErrorBoundary onReset={() => refetchData()}>
 *     <YourComponent />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    /**
     * Static method called when an error is thrown.
     * Updates state to trigger fallback UI rendering.
     */
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    /**
     * Lifecycle method called after an error has been thrown.
     * Use this to log error information.
     */
    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary] Caught an error:', error);
        console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
        
        this.setState({ errorInfo });
        
        // If an onError callback is provided, call it
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    /**
     * Reset the error boundary state and optionally trigger a callback.
     * Called when the user clicks "Try Again".
     */
    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
        
        // If an onReset callback is provided, call it
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    /**
     * Render either the children or the fallback UI based on error state.
     */
    render() {
        if (this.state.hasError) {
            // If a custom fallback component is provided, render it
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default fallback UI
            return (
                <div style={styles.container}>
                    <div style={styles.card}>
                        <div style={styles.iconContainer}>
                            <span style={styles.icon}>⚠️</span>
                        </div>
                        
                        <h2 style={styles.title}>Etwas ist schiefgelaufen</h2>
                        
                        <p style={styles.message}>
                            Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut 
                            oder kontaktieren Sie den Support, wenn das Problem weiterhin besteht.
                        </p>
                        
                        {/* Show error details in development mode */}
                        {this.state.error && (
                            <details style={styles.details}>
                                <summary style={styles.summary}>
                                    Technische Details
                                </summary>
                                <div style={styles.errorBox}>
                                    <p style={styles.errorName}>
                                        {this.state.error.name}: {this.state.error.message}
                                    </p>
                                    {this.state.errorInfo && (
                                        <pre style={styles.stack}>
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            </details>
                        )}
                        
                        <div style={styles.actions}>
                            <button 
                                style={styles.primaryButton}
                                onClick={this.handleReset}
                            >
                                🔄 Erneut versuchen
                            </button>
                            
                            <button 
                                style={styles.secondaryButton}
                                onClick={() => window.location.reload()}
                            >
                                Seite neu laden
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        // No error - render children normally
        return this.props.children;
    }
}

/**
 * Inline styles for the Error Boundary fallback UI.
 * Using inline styles to ensure they work even if CSS fails to load.
 */
const styles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: '20px',
        backgroundColor: '#F4F5F7',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif"
    },
    card: {
        background: 'white',
        borderRadius: '8px',
        padding: '32px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        textAlign: 'center'
    },
    iconContainer: {
        marginBottom: '16px'
    },
    icon: {
        fontSize: '48px'
    },
    title: {
        margin: '0 0 12px 0',
        fontSize: '20px',
        fontWeight: '600',
        color: '#172B4D'
    },
    message: {
        margin: '0 0 24px 0',
        fontSize: '14px',
        color: '#6B778C',
        lineHeight: '1.5'
    },
    details: {
        textAlign: 'left',
        marginBottom: '24px'
    },
    summary: {
        cursor: 'pointer',
        fontSize: '13px',
        color: '#0052CC',
        fontWeight: '500',
        padding: '8px 0'
    },
    errorBox: {
        background: '#FFEBE6',
        borderRadius: '4px',
        padding: '12px',
        marginTop: '8px',
        border: '1px solid #FFBDAD'
    },
    errorName: {
        margin: '0 0 8px 0',
        fontSize: '13px',
        fontWeight: '600',
        color: '#BF2600'
    },
    stack: {
        margin: '0',
        fontSize: '11px',
        color: '#6B778C',
        overflow: 'auto',
        maxHeight: '150px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
    },
    actions: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        flexWrap: 'wrap'
    },
    primaryButton: {
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: '500',
        color: 'white',
        backgroundColor: '#0052CC',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
    },
    secondaryButton: {
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#42526E',
        backgroundColor: '#F4F5F7',
        border: '1px solid #DFE1E6',
        borderRadius: '4px',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
    }
};

export default ErrorBoundary;