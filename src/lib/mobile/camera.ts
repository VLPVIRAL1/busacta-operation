import { isNative } from "./is-native";

/**
 * Open the native camera and return a File suitable for the existing upload
 * pipelines (petty-cash receipts, task attachments).
 * Returns null on web or if the user cancels.
 */
export async function takePhoto(): Promise<File | null> {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      /* @vite-ignore */ "@capacitor/camera" as any
    );
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false,
    });
    if (!photo.dataUrl) return null;
    const blob = await (await fetch(photo.dataUrl)).blob();
    const ext = photo.format || "jpeg";
    return new File([blob], `photo-${Date.now()}.${ext}`, {
      type: blob.type || `image/${ext}`,
    });
  } catch (err) {
    console.warn("[camera] failed:", err);
    return null;
  }
}
