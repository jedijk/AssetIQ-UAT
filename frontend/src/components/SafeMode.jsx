/**
 * SafeMode - Minimal UI for debugging white screen issues on older devices.
 * Activated via URL parameter: ?safe=1 or ?safemode=1
 * 
 * This component loads with minimal dependencies to help users:
 * 1. Confirm the app can load at all
 * 2. Clear caches and reset the app
 * 3. Report device info for debugging
 */
import React, { useState, useEffect } from 'react';

const SafeMode = () => {
  const [deviceInfo, setDeviceInfo] = useState({});
  const [cacheCleared, setCacheCleared] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Gather device info for debugging
    const info = {
      userAgent: navigator.userAgent || 'Unknown',
      platform: navigator.platform || 'Unknown',
      language: navigator.language || 'Unknown',
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      deviceMemory: navigator.deviceMemory || 'Unknown',
      hardwareConcurrency: navigator.hardwareConcurrency || 'Unknown',
      screenWidth: window.screen?.width || 'Unknown',
      screenHeight: window.screen?.height || 'Unknown',
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      touchSupport: 'ontouchstart' in window,
      localStorage: (() => {
        try { localStorage.setItem('test', '1'); localStorage.removeItem('test'); return true; } 
        catch (e) { return false; }
      })(),
      serviceWorker: 'serviceWorker' in navigator,
      connection: navigator.connection?.effectiveType || 'Unknown',
    };
    setDeviceInfo(info);
  }, []);

  const clearAllCaches = async () => {
    setLoading(true);
    try {
      // Clear localStorage
      try {
        localStorage.clear();
      } catch (e) {
        console.warn('Could not clear localStorage:', e);
      }

      // Clear sessionStorage
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('Could not clear sessionStorage:', e);
      }

      // Unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }

      // Clear caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      setCacheCleared(true);
    } catch (e) {
      console.error('Error clearing caches:', e);
    }
    setLoading(false);
  };

  const exitSafeMode = () => {
    // Remove safe mode parameter and reload
    const url = new URL(window.location.href);
    url.searchParams.delete('safe');
    url.searchParams.delete('safemode');
    window.location.href = url.toString();
  };

  const hardReload = () => {
    window.location.reload(true);
  };

  const copyDeviceInfo = () => {
    const text = JSON.stringify(deviceInfo, null, 2);
    navigator.clipboard?.writeText(text).then(() => {
      alert('Device info copied to clipboard!');
    }).catch(() => {
      prompt('Copy this device info:', text);
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        maxWidth: '500px',
        margin: '0 auto',
        background: '#ffffff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            background: '#fef3c7',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
          }}>
            🛡️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
              Safe Mode
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
              Minimal UI for troubleshooting
            </p>
          </div>
        </div>

        {/* Status */}
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '20px',
        }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#166534' }}>
            ✓ App loaded successfully in safe mode
          </p>
        </div>

        {/* Actions */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '12px' }}>
            Recovery Actions
          </h2>
          
          <button
            onClick={clearAllCaches}
            disabled={loading || cacheCleared}
            style={{
              width: '100%',
              padding: '12px 16px',
              marginBottom: '10px',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              background: cacheCleared ? '#f0fdf4' : '#ffffff',
              color: cacheCleared ? '#166534' : '#334155',
              fontSize: '14px',
              fontWeight: '500',
              cursor: loading || cacheCleared ? 'default' : 'pointer',
              textAlign: 'left',
            }}
          >
            {loading ? '⏳ Clearing...' : cacheCleared ? '✓ Caches cleared' : '🗑️ Clear all caches & data'}
          </button>

          <button
            onClick={hardReload}
            style={{
              width: '100%',
              padding: '12px 16px',
              marginBottom: '10px',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              background: '#ffffff',
              color: '#334155',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🔄 Hard reload page
          </button>

          <button
            onClick={exitSafeMode}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              borderRadius: '10px',
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Exit Safe Mode & Load Full App
          </button>
        </div>

        {/* Device Info */}
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '10px',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#334155', margin: 0 }}>
              Device Information
            </h2>
            <button
              onClick={copyDeviceInfo}
              style={{
                padding: '6px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                background: '#ffffff',
                color: '#64748b',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Copy
            </button>
          </div>
          
          <div style={{
            background: '#f8fafc',
            borderRadius: '10px',
            padding: '12px',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#475569',
            maxHeight: '200px',
            overflow: 'auto',
          }}>
            {Object.entries(deviceInfo).map(([key, value]) => (
              <div key={key} style={{ marginBottom: '4px' }}>
                <span style={{ color: '#94a3b8' }}>{key}:</span>{' '}
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p style={{ 
          marginTop: '20px', 
          fontSize: '11px', 
          color: '#94a3b8', 
          textAlign: 'center',
        }}>
          If you continue to see white screens, please share the device info above with support.
        </p>
      </div>
    </div>
  );
};

// Check if safe mode is requested
export function isSafeModeRequested() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('safe') === '1' || params.get('safemode') === '1';
  } catch (e) {
    return false;
  }
}

export default SafeMode;
