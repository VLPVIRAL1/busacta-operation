// @ts-expect-error — @capacitor/cli is a devDependency installed locally for native builds
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.busacta.one",
  appName: "BusAcTa Operations",
  webDir: "dist",
  // Load the live published app so mobile users always see the latest build
  // without resubmitting to the App Store / Play Store.
  server: {
    url: "https://one.busacta.com",
    cleartext: false,
    androidScheme: "https",
    // Custom scheme for OAuth deep-link return + in-app navigation.
    iosScheme: "busacta",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0b0b0e",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b0b0e",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
