/**
 * GlobalErrorBoundary - Root-level error boundary to catch any React errors.
 * This is the last line of defense before a white screen.
 */
import React from 'react';
import { debugLog } from '../lib/debug';

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    
    // Log the error for debugging
    try {
      debugLog('global_error_boundary', {
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        componentStack: String(errorInfo?.componentStack || ''),
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.error('GlobalErrorBoundary caught:', error);
    }
  }

  handleReload = async () => {
    try {
      // Clear caches before reload
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      // Clear localStorage lite mode preference to start fresh
      try {
        localStorage.removeItem('forceLiteMode');
      } catch (e) {}
    } catch (e) {
      console.warn('Cache clear failed:', e);
    }
    window.location.reload();
  };

  handleRetry = () => {
    this.setState(prev => ({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  handleSafeMode = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('safe', '1');
    window.location.href = url.toString();
  };

  handleEnableLiteMode = () => {
    try {
      localStorage.setItem('forceLiteMode', 'true');
    } catch (e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      const errorMessage = String(error?.message || 'Unknown error');
      const showRetry = retryCount < 2;

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <div style={{ maxWidth: '400px', width: '100%' }}>
            {/* Icon */}
            <div style={{
              width: '56px',
              height: '56px',
              background: '#fef2f2',
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              fontSize: '28px',
            }}>
              ⚠️
            </div>

            {/* Title */}
            <h1 style={{
              margin: '0 0 8px',
              fontSize: '20px',
              fontWeight: '700',
              color: '#0f172a',
            }}>
              Something went wrong
            </h1>

            {/* Description */}
            <p style={{
              margin: '0 0 20px',
              fontSize: '14px',
              lineHeight: '1.5',
              color: '#64748b',
            }}>
              The app encountered an error. This can happen on older devices or with slow connections.
            </p>

            {/* Error details (collapsed) */}
            <details style={{
              marginBottom: '20px',
              padding: '12px',
              background: '#f8fafc',
              borderRadius: '10px',
              fontSize: '12px',
            }}>
              <summary style={{ 
                cursor: 'pointer', 
                color: '#64748b',
                fontWeight: '500',
              }}>
                Error details
              </summary>
              <pre style={{
                marginTop: '10px',
                padding: '10px',
                background: '#f1f5f9',
                borderRadius: '6px',
                fontSize: '10px',
                color: '#475569',
                overflow: 'auto',
                maxHeight: '120px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {errorMessage}
              </pre>
            </details>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {showRetry && (
                <button
                  onClick={this.handleRetry}
                  style={{
                    padding: '12px 20px',
                    border: 'none',
                    borderRadius: '10px',
                    background: '#0f172a',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Try Again
                </button>
              )}

              <button
                onClick={this.handleReload}
                style={{
                  padding: '12px 20px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Reload & Clear Cache
              </button>

              <button
                onClick={this.handleEnableLiteMode}
                style={{
                  padding: '12px 20px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                🚀 Enable Lite Mode & Reload
              </button>

              <button
                onClick={this.handleSafeMode}
                style={{
                  padding: '12px 20px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  background: '#ffffff',
                  color: '#64748b',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Open Safe Mode
              </button>
            </div>

            {/* Help text */}
            <p style={{
              marginTop: '20px',
              fontSize: '12px',
              color: '#94a3b8',
              textAlign: 'center',
            }}>
              If this keeps happening, try enabling Lite Mode for better performance on your device.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
