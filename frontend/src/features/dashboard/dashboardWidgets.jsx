import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { getBackendUrl } from "../../lib/apiConfig";
import { AuthenticatedImage } from "../../components/AuthenticatedMedia";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../components/ui/hover-card";
import { Progress } from "../../components/ui/progress";
import { X, Download } from "lucide-react";

// Authenticated Lightbox component for viewing images with proper mobile auth
const AuthenticatedLightbox = ({ url, name, onClose }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    
    const fetchImage = async () => {
      // If it's a data URL (base64 signature), use directly
      if (url?.startsWith('data:')) {
        setBlobUrl(url);
        setIsLoading(false);
        return;
      }
      
      // If it's already a blob URL, use directly
      if (url?.startsWith('blob:')) {
        setBlobUrl(url);
        setIsLoading(false);
        return;
      }

      try {
        const token = localStorage.getItem("token");
        
        // Build full URL if needed
        let fullUrl = url;
        if (url?.startsWith("/api/")) {
          fullUrl = `${getBackendUrl()}${url}`;
        }

        const response = await fetch(fullUrl, {
          headers: {
            "Authorization": token ? `Bearer ${token}` : "",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load lightbox image:", err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchImage();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  const handleDownload = (e) => {
    e.stopPropagation();
    if (blobUrl) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = name || 'image';
      link.click();
    }
  };

  return (
    <div 
      data-testid="image-lightbox"
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 sm:top-4 sm:right-4 text-white hover:bg-white/20 active:bg-white/30 z-10 w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-black/40"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="w-7 h-7 sm:w-6 sm:h-6" />
      </Button>
      
      {/* Download button */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 left-2 sm:top-4 sm:left-4 text-white hover:bg-white/20 active:bg-white/30 z-10 h-12 sm:h-auto px-3 sm:px-4 rounded-full sm:rounded-md bg-black/40"
        onClick={handleDownload}
        disabled={!blobUrl}
      >
        <Download className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
        <span className="hidden sm:inline">Download</span>
      </Button>
      
      <div className="relative max-w-full max-h-full flex items-center justify-center">
        {isLoading && (
          <div className="flex items-center justify-center">
            <div className="animate-spin h-10 w-10 border-3 border-amber-500 border-t-transparent rounded-full" />
          </div>
        )}
        
        {error && (
          <div className="text-white/70 text-center">
            <p className="text-lg mb-2">Failed to load image</p>
            <p className="text-sm">Click anywhere to close</p>
          </div>
        )}
        
        {blobUrl && !isLoading && !error && (
          <img
            src={blobUrl}
            alt={name}
            className="max-w-full max-h-[80vh] sm:max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        
        {/* File name */}
        {name && (
          <div className="absolute -bottom-8 sm:-bottom-10 left-0 right-0 text-center px-4">
            <p className="text-white/80 text-xs sm:text-sm truncate">{name}</p>
          </div>
        )}
      </div>
      
      {/* Tap to close hint on mobile */}
      <p className="absolute bottom-4 left-0 right-0 text-center text-white/50 text-xs sm:hidden">
        Tap outside image to close
      </p>
    </div>
  );
};

// Image component with fallback for failed loads
const ImageWithFallback = ({ src, alt, fallback, className = "" }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  if (hasError) {
    return fallback;
  }

  return (
    <>
      {isLoading && (
        <div className={`flex items-center justify-center bg-slate-50 ${className}`}>
          <div className="animate-spin h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${isLoading ? 'hidden' : ''}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </>
  );
};

// User avatar component with optional hover card
const UserAvatar = ({ name, photo, initials, size = "sm", position = null, showPopover = false }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const sizeClasses = {
    xs: "w-5 h-5 text-[8px]",
    sm: "w-6 h-6 text-[9px]",
    md: "w-8 h-8 text-xs",
    lg: "w-10 h-10 text-sm"
  };
  
  // Generate a consistent color based on name
  const getAvatarColor = (name) => {
    const colors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
      "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500"
    ];
    if (!name) return colors[0];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Build photo URL with auth token if needed
  const getPhotoUrl = () => {
    if (!photo || imageError) return null;
    
    // If it's an API path, add auth token and backend URL
    if (photo.startsWith("/api/")) {
      const AUTH_MODE = process.env.REACT_APP_AUTH_MODE || "bearer"; // "bearer" | "cookie"
      const token = AUTH_MODE === "bearer" ? localStorage.getItem("token") : null;
      const backendUrl = getBackendUrl();
      
      // Only build URL if we have all required parts
      if (backendUrl && backendUrl.startsWith('http')) {
        if (AUTH_MODE === "cookie") {
          return `${backendUrl}${photo}`;
        }
        if (token) {
          return `${backendUrl}${photo}?token=${token}`;
        }
      }
      // If backend URL is not configured, skip the image
      return null;
    }
    
    // If it's already a full URL (https://...), use as-is
    if (photo.startsWith("http")) {
      return photo;
    }
    
    // For any other path format, skip (prevents 404s from relative paths)
    return null;
  };

  const photoUrl = getPhotoUrl();

  // Initials fallback element
  const initialsElement = (
    <div 
      className={`${sizeClasses[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-medium ring-2 ring-white flex-shrink-0 cursor-pointer`}
      title={!showPopover ? (name || "Unknown user") : undefined}
    >
      {initials || (name ? name.charAt(0).toUpperCase() : "?")}
    </div>
  );

  const avatarElement = photoUrl ? (
    <div className="relative">
      {/* Show initials as fallback while image loads or on error */}
      {(!imageLoaded || imageError) && (
        <div 
          className={`${sizeClasses[size]} ${getAvatarColor(name)} rounded-full flex items-center justify-center text-white font-medium ring-2 ring-white flex-shrink-0 cursor-pointer absolute inset-0`}
          title={!showPopover ? (name || "Unknown user") : undefined}
        >
          {initials || (name ? name.charAt(0).toUpperCase() : "?")}
        </div>
      )}
      <img
        src={photoUrl}
        alt={name || "User"}
        className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-white flex-shrink-0 cursor-pointer ${imageLoaded && !imageError ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setImageLoaded(true)}
        onError={(e) => {
          setImageError(true);
          setImageLoaded(false);
        }}
      />
    </div>
  ) : initialsElement;

  if (showPopover && name) {
    return (
      <HoverCard openDelay={200} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span className="inline-block" onClick={(e) => e.stopPropagation()}>
            {avatarElement}
          </span>
        </HoverCardTrigger>
        <HoverCardContent className="w-48 p-3" side="top" align="center">
          <div className="flex items-center gap-3">
            {photoUrl && !imageError ? (
              <div className="relative w-10 h-10">
                {/* Initials fallback */}
                <div className={`w-10 h-10 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-sm font-semibold text-white absolute inset-0`}>
                  {initials || name.charAt(0).toUpperCase()}
                </div>
                {/* Photo overlay */}
                <img 
                  src={photoUrl} 
                  alt={name} 
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 absolute inset-0"
                  onError={() => setImageError(true)}
                />
              </div>
            ) : (
              <div className={`w-10 h-10 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-sm font-semibold text-white`}>
                {initials || name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                {position || "Team Member"}
              </p>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return avatarElement;
};

// Mini chart component for trends
const MiniBarChart = ({ data, maxValue }) => {
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((value, idx) => (
        <div
          key={idx}
          className="flex-1 bg-indigo-400 rounded-t transition-all hover:bg-indigo-500"
          style={{ height: `${(value / maxValue) * 100}%`, minHeight: value > 0 ? '4px' : '0' }}
        />
      ))}
    </div>
  );
};

// Stat card component - clickable with deep linking
const StatCard = ({ label, value, icon: Icon, color, bg, subtitle, trend, trendUp, onClick, clickable = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`themed-card rounded-xl border p-4 transition-all ${
      clickable ? 'hover:shadow-md cursor-pointer active:scale-[0.98]' : 'hover:shadow-md'
    }`}
    onClick={clickable ? onClick : undefined}
    role={clickable ? "button" : undefined}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted mb-1 flex items-center gap-1">
          {label}
          {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
        </p>
        <p className="text-2xl font-bold text-primary">{value}</p>
        {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
      </div>
      <div className={`p-2.5 rounded-xl ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </div>
    {trend !== undefined && (
      <div className={`flex items-center gap-1 mt-2 text-xs ${trendUp ? 'text-red-500' : 'text-green-500'}`}>
        {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span>{trend}% vs last week</span>
      </div>
    )}
  </motion.div>
);

// Progress card for completion metrics - clickable
const ProgressCard = ({ title, completed, total, icon: Icon, color, onClick, clickable = false }) => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div 
      className={`themed-card rounded-xl border p-4 transition-all ${
        clickable ? 'hover:shadow-md cursor-pointer active:scale-[0.98]' : ''
      }`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-secondary flex items-center gap-1">
            {title}
            {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
          </p>
          <p className="text-xs text-muted">{completed} of {total} completed</p>
        </div>
      </div>
      <Progress value={percentage} className="h-2" />
      <p className="text-right text-xs text-muted mt-1">{percentage}%</p>
    </div>
  );
};

// Distribution card - clickable
const DistributionCard = ({ title, data, colors, onClick, clickable = false }) => {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <div 
      className={`themed-card rounded-xl border p-4 transition-all ${
        clickable ? 'hover:shadow-md cursor-pointer active:scale-[0.98]' : ''
      }`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
    >
      <h3 className="text-sm font-medium text-secondary mb-3 flex items-center gap-1">
        {title}
        {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
      </h3>
      <div className="space-y-2">
        {Object.entries(data).map(([key, value], idx) => {
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`} />
              <span className="text-xs text-muted flex-1 capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="text-xs font-medium text-secondary">{value}</span>
              <span className="text-xs text-muted">({percentage}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Recent item card - clickable
const RecentItemCard = ({ items, title, icon: Icon, emptyMessage, renderItem, onClick, clickable = false }) => (
  <div 
    className={`themed-card rounded-xl border p-4 transition-all ${
      clickable ? 'hover:shadow-md cursor-pointer' : ''
    }`}
    onClick={clickable ? onClick : undefined}
    role={clickable ? "button" : undefined}
  >
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-muted" />
      <h3 className="text-sm font-medium text-secondary flex items-center gap-1">
        {title}
        {clickable && <ExternalLink className="w-3 h-3 opacity-50" />}
      </h3>
    </div>
    {items.length > 0 ? (
      <div className="space-y-2">
        {items.slice(0, 5).map((item, idx) => renderItem(item, idx))}
      </div>
    ) : (
      <p className="text-xs text-muted text-center py-4">{emptyMessage}</p>
    )}
  </div>
);
export {
  AuthenticatedLightbox,
  ImageWithFallback,
  UserAvatar,
  MiniBarChart,
  StatCard,
  ProgressCard,
  DistributionCard,
  RecentItemCard,
};
