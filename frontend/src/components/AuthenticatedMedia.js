/**
 * AuthenticatedMedia - Components for loading media (images/videos) with proper auth headers
 * 
 * Mobile browsers often have issues with token-based query params in <img>/<video> src attributes.
 * These components fetch media using Authorization headers and convert to blob URLs.
 */
import { useState, useEffect } from "react";

const getBackendUrl = () => {
  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  if (!backendUrl) return "";
  return backendUrl.endsWith("/") ? backendUrl.slice(0, -1) : backendUrl;
};

/**
 * Custom hook to fetch authenticated media as blob URL
 */
export const useAuthenticatedMedia = (url) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let objectUrl = null;

    const fetchMedia = async () => {
      if (!url) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem("token");
        
        // Build full URL if needed
        let fullUrl = url;
        if (url.startsWith("/api/")) {
          fullUrl = `${getBackendUrl()}${url}`;
        }

        const response = await fetch(fullUrl, {
          headers: {
            "Authorization": token ? `Bearer ${token}` : "",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setBlobUrl(objectUrl);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch authenticated media:", err);
        if (isMounted) {
          setError(err.message);
          setIsLoading(false);
        }
      }
    };

    fetchMedia();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return { blobUrl, isLoading, error };
};

/**
 * AuthenticatedImage - Image component that loads via auth headers
 */
export const AuthenticatedImage = ({ 
  src, 
  alt = "", 
  className = "", 
  fallback = null,
  onLoad = null,
  onError = null 
}) => {
  const { blobUrl, isLoading, error } = useAuthenticatedMedia(src);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset imgLoaded when src changes
  useEffect(() => {
    setImgLoaded(false);
  }, [src]);

  const handleImageLoad = () => {
    setImgLoaded(true);
    if (onLoad) onLoad();
  };

  const handleImageError = () => {
    if (onError) onError();
  };

  if (error || (!isLoading && !blobUrl)) {
    return fallback || (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}>
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <>
      {(isLoading || !imgLoaded) && (
        <div className={`flex items-center justify-center bg-slate-50 ${className}`}>
          <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      )}
      {blobUrl && (
        <img
          src={blobUrl}
          alt={alt}
          className={`${className} ${!imgLoaded ? 'hidden' : ''}`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}
    </>
  );
};

/**
 * AuthenticatedVideo - Video component that loads via auth headers
 */
export const AuthenticatedVideo = ({ 
  src, 
  className = "", 
  controls = true,
  autoPlay = false,
  muted = false,
  loop = false,
  fallback = null 
}) => {
  const { blobUrl, isLoading, error } = useAuthenticatedMedia(src);

  if (error || (!isLoading && !blobUrl)) {
    return fallback || (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}>
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 ${className}`}>
        <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <video
      src={blobUrl}
      className={className}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
    />
  );
};

/**
 * Helper to build authenticated media URL (for cases where you need the URL string)
 * Note: This still uses token query param - use AuthenticatedImage/Video components
 * for better mobile compatibility
 */
export const buildAuthenticatedUrl = (path) => {
  if (!path) return null;
  
  const token = localStorage.getItem("token");
  const backendUrl = getBackendUrl();
  
  if (path.startsWith("/api/")) {
    return `${backendUrl}${path}${token ? `?token=${token}` : ''}`;
  }
  
  if (path.startsWith("http")) {
    return path;
  }
  
  // Assume it's a storage path
  return `${backendUrl}/api/storage/${path}${token ? `?token=${token}` : ''}`;
};

export default AuthenticatedImage;
