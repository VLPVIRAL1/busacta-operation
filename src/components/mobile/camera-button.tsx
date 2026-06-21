import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNative } from "@/lib/mobile/is-native";
import { takePhoto } from "@/lib/mobile/camera";

interface CameraButtonProps {
  onCaptured: (file: File) => void;
  className?: string;
  label?: string;
}

/**
 * Native-only "Take photo" button. Renders nothing on web so existing
 * upload UI stays unchanged for desktop users.
 */
export function CameraButton({ onCaptured, className, label = "Take photo" }: CameraButtonProps) {
  if (!isNative()) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        const file = await takePhoto();
        if (file) onCaptured(file);
      }}
    >
      <Camera className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
