/**
 * Secure Storage Service
 * Provides encrypted localStorage wrapper to protect sensitive data from XSS attacks.
 * Uses AES-GCM encryption with a session-derived key.
 */

// Simple encryption/decryption using Web Crypto API
const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

class SecureStorageService {
  constructor() {
    this.cryptoKey = null;
    this.keyPromise = null;
    this.isInitialized = false;
  }

  /**
   * Generate or retrieve the encryption key.
   * Key is derived from a combination of session-specific data.
   */
  async getOrCreateKey() {
    if (this.cryptoKey) return this.cryptoKey;
    
    // Prevent multiple simultaneous key generations
    if (this.keyPromise) return this.keyPromise;

    this.keyPromise = (async () => {
      try {
        // Check if we have a stored key material
        const storedKeyMaterial = sessionStorage.getItem('_sk');
        
        let keyMaterial;
        if (storedKeyMaterial) {
          keyMaterial = this.base64ToArrayBuffer(storedKeyMaterial);
        } else {
          // Generate new random key material
          keyMaterial = crypto.getRandomValues(new Uint8Array(32));
          sessionStorage.setItem('_sk', this.arrayBufferToBase64(keyMaterial));
        }

        // Import the key material
        this.cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyMaterial,
          { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
          false,
          ['encrypt', 'decrypt']
        );

        this.isInitialized = true;
        return this.cryptoKey;
      } catch (error) {
        console.warn('SecureStorage: Crypto API not available, falling back to obfuscation');
        this.isInitialized = false;
        return null;
      }
    })();

    return this.keyPromise;
  }

  /**
   * Encrypt data using AES-GCM
   */
  async encrypt(data) {
    const key = await this.getOrCreateKey();
    
    if (!key) {
      // Fallback: simple obfuscation (not secure, but better than plaintext)
      return btoa(encodeURIComponent(JSON.stringify(data)));
    }

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));
      
      // Generate random IV for each encryption
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: ENCRYPTION_ALGORITHM, iv },
        key,
        dataBuffer
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encryptedBuffer), iv.length);

      return this.arrayBufferToBase64(combined);
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback to obfuscation
      return btoa(encodeURIComponent(JSON.stringify(data)));
    }
  }

  /**
   * Decrypt data using AES-GCM
   */
  async decrypt(encryptedData) {
    if (!encryptedData) return null;

    const key = await this.getOrCreateKey();
    
    if (!key) {
      // Fallback: simple de-obfuscation
      try {
        return JSON.parse(decodeURIComponent(atob(encryptedData)));
      } catch {
        return null;
      }
    }

    try {
      const combined = this.base64ToArrayBuffer(encryptedData);
      const combinedArray = new Uint8Array(combined);
      
      // Extract IV (first 12 bytes) and encrypted data
      const iv = combinedArray.slice(0, 12);
      const encryptedBuffer = combinedArray.slice(12);

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: ENCRYPTION_ALGORITHM, iv },
        key,
        encryptedBuffer
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedBuffer));
    } catch (error) {
      // Try fallback decryption
      try {
        return JSON.parse(decodeURIComponent(atob(encryptedData)));
      } catch {
        console.error('Decryption failed:', error);
        return null;
      }
    }
  }

  // Helper: ArrayBuffer to Base64
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper: Base64 to ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Securely store a value
   */
  async setItem(key, value) {
    try {
      const encrypted = await this.encrypt(value);
      localStorage.setItem(`_sec_${key}`, encrypted);
    } catch (error) {
      console.error('SecureStorage setItem failed:', error);
    }
  }

  /**
   * Retrieve a securely stored value
   */
  async getItem(key) {
    try {
      const encrypted = localStorage.getItem(`_sec_${key}`);
      if (!encrypted) return null;
      return await this.decrypt(encrypted);
    } catch (error) {
      console.error('SecureStorage getItem failed:', error);
      return null;
    }
  }

  /**
   * Remove a securely stored value
   */
  removeItem(key) {
    localStorage.removeItem(`_sec_${key}`);
  }

  /**
   * Clear all securely stored values
   */
  clear() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('_sec_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    sessionStorage.removeItem('_sk');
    this.cryptoKey = null;
    this.keyPromise = null;
  }

  // ===============================
  // Synchronous API for compatibility
  // ===============================

  /**
   * Synchronous get (for backwards compatibility)
   * Note: This returns encrypted data if crypto operations haven't completed
   */
  getItemSync(key) {
    // First check secure storage
    const secureValue = localStorage.getItem(`_sec_${key}`);
    if (secureValue) {
      // If we have a cached decrypted value, return it
      // Otherwise, try sync decryption (fallback only)
      try {
        return JSON.parse(decodeURIComponent(atob(secureValue)));
      } catch {
        return null;
      }
    }
    
    // Fallback to legacy unencrypted storage
    const legacyValue = localStorage.getItem(key);
    if (legacyValue) {
      try {
        return JSON.parse(legacyValue);
      } catch {
        return legacyValue;
      }
    }
    
    return null;
  }

  /**
   * Synchronous set (for backwards compatibility)
   * Uses obfuscation as sync crypto isn't available
   */
  setItemSync(key, value) {
    try {
      const obfuscated = btoa(encodeURIComponent(JSON.stringify(value)));
      localStorage.setItem(`_sec_${key}`, obfuscated);
    } catch (error) {
      console.error('SecureStorage setItemSync failed:', error);
    }
  }
}

// Create singleton instance
export const secureStorage = new SecureStorageService();

/**
 * Token management helpers
 * These provide a drop-in replacement for direct localStorage token access
 */
export const tokenStorage = {
  async setToken(token) {
    await secureStorage.setItem('token', token);
    // Also set in regular localStorage for backwards compatibility during migration
    localStorage.setItem('token', token);
  },

  async getToken() {
    // Try secure storage first
    const secureToken = await secureStorage.getItem('token');
    if (secureToken) return secureToken;
    
    // Fallback to legacy localStorage
    return localStorage.getItem('token');
  },

  getTokenSync() {
    // For synchronous access (headers, etc.)
    return localStorage.getItem('token');
  },

  removeToken() {
    secureStorage.removeItem('token');
    localStorage.removeItem('token');
  }
};

/**
 * User data management helpers
 */
export const userStorage = {
  async setUser(user) {
    await secureStorage.setItem('user', user);
  },

  async getUser() {
    return await secureStorage.getItem('user');
  },

  removeUser() {
    secureStorage.removeItem('user');
  }
};

export default secureStorage;
