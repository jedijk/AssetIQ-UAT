import { useState, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  RotateCw, 
  Sun, 
  Contrast, 
  FlipHorizontal,
  FlipVertical,
  RefreshCw,
  Check,
  X
} from "lucide-react";

// Helper function to create image from URL
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

// Helper to get cropped image as blob
const getCroppedImg = async (imageSrc, pixelCrop, rotation = 0, flip = { horizontal: false, vertical: false }, filters = { brightness: 100, contrast: 100 }) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) return null;

  const rotRad = (rotation * Math.PI) / 180;

  // Calculate bounding box of the rotated image
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    rotation
  );

  // Set canvas size to match the bounding box
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  // Translate canvas context to center
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
  ctx.translate(-image.width / 2, -image.height / 2);

  // Apply filters
  ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;

  // Draw rotated image
  ctx.drawImage(image, 0, 0);

  // Extract the cropped area
  const croppedCanvas = document.createElement("canvas");
  const croppedCtx = croppedCanvas.getContext("2d");

  if (!croppedCtx) return null;

  // Set canvas size to final crop size
  croppedCanvas.width = pixelCrop.width;
  croppedCanvas.height = pixelCrop.height;

  // Draw the cropped area
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Return as blob
  return new Promise((resolve) => {
    croppedCanvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      "image/jpeg",
      0.9
    );
  });
};

// Helper to calculate new size after rotation
function rotateSize(width, height, rotation) {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

const ImageEditor = ({ 
  open, 
  onClose, 
  imageSrc, 
  onSave,
  aspectRatio = 1,
  cropShape = "round",
  title = "Edit Photo"
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [flip, setFlip] = useState({ horizontal: false, vertical: false });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    
    setSaving(true);
    try {
      const croppedBlob = await getCroppedImg(
        imageSrc, 
        croppedAreaPixels, 
        rotation,
        flip,
        { brightness, contrast }
      );
      
      if (croppedBlob) {
        // Create a File from the Blob
        const file = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });
        onSave(file);
      }
    } catch (error) {
      console.error("Error cropping image:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setFlip({ horizontal: false, vertical: false });
    setBrightness(100);
    setContrast(100);
  };

  const rotateLeft = () => setRotation((r) => r - 90);
  const rotateRight = () => setRotation((r) => r + 90);
  const flipHorizontal = () => setFlip((f) => ({ ...f, horizontal: !f.horizontal }));
  const flipVertical = () => setFlip((f) => ({ ...f, vertical: !f.vertical }));

  // Generate preview filter style
  const filterStyle = {
    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Cropper Area */}
          <div className="relative h-[300px] bg-slate-900 rounded-lg overflow-hidden">
            <div style={filterStyle} className="absolute inset-0">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={aspectRatio}
                cropShape={cropShape}
                showGrid={true}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                style={{
                  containerStyle: {
                    transform: `scale(${flip.horizontal ? -1 : 1}, ${flip.vertical ? -1 : 1})`,
                  },
                }}
              />
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-4 px-2">
            {/* Zoom Control */}
            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <Label className="text-xs text-slate-500 mb-1 block">Zoom</Label>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.1}
                  onValueChange={([val]) => setZoom(val)}
                  className="w-full"
                />
              </div>
              <ZoomIn className="w-4 h-4 text-slate-500" />
            </div>

            {/* Brightness Control */}
            <div className="flex items-center gap-3">
              <Sun className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <Label className="text-xs text-slate-500 mb-1 block">Brightness: {brightness}%</Label>
                <Slider
                  value={[brightness]}
                  min={50}
                  max={150}
                  step={5}
                  onValueChange={([val]) => setBrightness(val)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Contrast Control */}
            <div className="flex items-center gap-3">
              <Contrast className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <Label className="text-xs text-slate-500 mb-1 block">Contrast: {contrast}%</Label>
                <Slider
                  value={[contrast]}
                  min={50}
                  max={150}
                  step={5}
                  onValueChange={([val]) => setContrast(val)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Rotation & Flip Buttons */}
            <div className="flex items-center justify-center gap-2 pt-2 border-t">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={rotateLeft}
                className="flex items-center gap-1"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Rotate Left</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={rotateRight}
                className="flex items-center gap-1"
              >
                <RotateCw className="w-4 h-4" />
                <span className="hidden sm:inline">Rotate Right</span>
              </Button>
              <Button 
                variant={flip.horizontal ? "default" : "outline"}
                size="sm" 
                onClick={flipHorizontal}
                className="flex items-center gap-1"
              >
                <FlipHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Flip H</span>
              </Button>
              <Button 
                variant={flip.vertical ? "default" : "outline"}
                size="sm" 
                onClick={flipVertical}
                className="flex items-center gap-1"
              >
                <FlipVertical className="w-4 h-4" />
                <span className="hidden sm:inline">Flip V</span>
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleReset}
                className="flex items-center gap-1 text-slate-500"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
            <Check className="w-4 h-4 mr-1" />
            {saving ? "Saving..." : "Save Photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageEditor;
