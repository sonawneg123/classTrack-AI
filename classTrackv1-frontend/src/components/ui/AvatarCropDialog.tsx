/**
 * src/components/ui/AvatarCropDialog.tsx
 *
 * Profile-photo crop / adjust dialog.
 *
 * UX flow:
 *   1. Parent passes the raw File selected by the user.
 *   2. The dialog shows a circular crop area over the image.
 *   3. The user can zoom (slider or pinch) and pan (drag) to adjust.
 *   4. Confirming produces a cropped Blob (JPEG, max 800 px) via canvas.
 *   5. The Blob is wrapped in a File and returned via onConfirm.
 *
 * No external libraries beyond react-easy-crop and MUI are required.
 * The final stored file is always a JPEG regardless of the source format —
 * this keeps file sizes small and avoids WebP/PNG browser inconsistencies.
 */
import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";

/** Type for the pixel-level crop area returned by react-easy-crop's onCropComplete. */
type CroppedAreaPixels = { x: number; y: number; width: number; height: number };
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  Typography,
} from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reads a File into an object URL string for react-easy-crop. */
function fileToObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Crops the image using canvas and returns a JPEG Blob.
 *
 * Output size is capped at 800 × 800 px to keep uploads lightweight.
 * The canvas is always square; react-easy-crop guarantees a square
 * croppedAreaPixels when aspect = 1.
 */
async function cropImageToBlob(
  imageSrc: string,
  croppedAreaPixels: CroppedAreaPixels
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const OUTPUT_SIZE = Math.min(800, croppedAreaPixels.width);
      const canvas = document.createElement("canvas");
      canvas.width  = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d")!;

      ctx.drawImage(
        img,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed."));
        },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = () => reject(new Error("Image failed to load for cropping."));
    img.src = imageSrc;
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AvatarCropDialogProps {
  /** Raw file selected by the user. Null means dialog is closed. */
  file: File | null;
  /** Called with the cropped File when the user confirms. */
  onConfirm: (cropped: File) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AvatarCropDialog({
  file,
  onConfirm,
  onCancel,
}: AvatarCropDialogProps) {
  const [crop,   setCrop]   = useState({ x: 0, y: 0 });
  const [zoom,   setZoom]   = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedAreaPixels | null>(null);
  const [processing, setProcessing] = useState(false);

  // Generate a stable object URL for the file — recreated each time `file` changes
  const imageSrc = file ? fileToObjectUrl(file) : null;

  const onCropComplete = useCallback(
    (_croppedArea: unknown, pixels: CroppedAreaPixels) => {
      setCroppedAreaPixels(pixels);
    },
    []
  );

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels);
      const croppedFile = new File([blob], file!.name, { type: "image/jpeg" });
      URL.revokeObjectURL(imageSrc);
      onConfirm(croppedFile);
    } catch {
      // Cropping failed — fall back to the original uncropped file
      URL.revokeObjectURL(imageSrc);
      onConfirm(file!);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    onCancel();
  };

  return (
    <Dialog
      open={Boolean(file)}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby="avatar-crop-dialog-title"
    >
      <DialogTitle id="avatar-crop-dialog-title">
        Adjust profile photo
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Drag to reposition · Use the slider to zoom
        </Typography>

        {/* ── Crop area ── */}
        <Box
          sx={{
            position: "relative",
            width: "100%",
            height: 320,
            bgcolor: "#1a1a1a",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </Box>

        {/* ── Zoom slider ── */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          sx={{ mt: 2, px: 1 }}
        >
          <ZoomOutIcon fontSize="small" sx={{ color: "text.secondary" }} />
          <Slider
            value={zoom}
            min={1}
            max={3}
            step={0.05}
            onChange={(_e, v) => setZoom(v as number)}
            aria-label="Zoom"
            size="small"
          />
          <ZoomInIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancel} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!croppedAreaPixels || processing}
        >
          {processing ? "Saving…" : "Use photo"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
