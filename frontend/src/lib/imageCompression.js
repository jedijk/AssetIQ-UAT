/**
 * Image compression utility for reducing file sizes before upload
 * Uses browser-native Canvas API for compression
 */

/**
 * Compress an image file
 * @param {File} file - The image file to compress
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default: 1920)
 * @param {number} options.maxHeight - Maximum height (default: 1920)
 * @param {number} options.quality - JPEG/WebP quality 0-1 (default: 0.8)
 * @param {number} options.maxSizeMB - Target max size in MB (default: 1)
 * @returns {Promise<{file: File, originalSize: number, compressedSize: number, wasCompressed: boolean}>}
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.8,
    maxSizeMB = 1,
  } = options;

  // Only compress image files
  if (!file.type.startsWith('image/')) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      wasCompressed: false,
    };
  }

  // Skip compression for small files (under 500KB)
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size < 500 * 1024) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      wasCompressed: false,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Determine output format
        let outputType = 'image/jpeg';
        let outputExt = '.jpg';
        
        if (file.type === 'image/png' && file.size < maxSizeBytes) {
          // Keep PNG for small files to preserve transparency
          outputType = 'image/png';
          outputExt = '.png';
        } else if (file.type === 'image/webp') {
          outputType = 'image/webp';
          outputExt = '.webp';
        }

        // Convert to blob with quality setting
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({
                file,
                originalSize: file.size,
                compressedSize: file.size,
                wasCompressed: false,
              });
              return;
            }

            // If compressed size is larger than original, use original
            if (blob.size >= file.size) {
              resolve({
                file,
                originalSize: file.size,
                compressedSize: file.size,
                wasCompressed: false,
              });
              return;
            }

            // Create new File object with compressed data
            const compressedFileName = file.name.replace(/\.[^.]+$/, outputExt);
            const compressedFile = new File([blob], compressedFileName, {
              type: outputType,
              lastModified: Date.now(),
            });

            resolve({
              file: compressedFile,
              originalSize: file.size,
              compressedSize: compressedFile.size,
              wasCompressed: true,
            });
          },
          outputType,
          quality
        );
      };

      img.onerror = () => {
        // If image fails to load, return original
        resolve({
          file,
          originalSize: file.size,
          compressedSize: file.size,
          wasCompressed: false,
        });
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Format bytes to human readable string
 * @param {number} bytes 
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Calculate compression percentage
 * @param {number} original 
 * @param {number} compressed 
 * @returns {number}
 */
export function getCompressionPercent(original, compressed) {
  if (original === 0) return 0;
  return Math.round((1 - compressed / original) * 100);
}
