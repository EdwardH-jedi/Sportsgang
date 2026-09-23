// Dynamic Expo config — reads environment variables at build/start time.
// This replaces static app.json for any value that differs between
// local dev and staging.  Static metadata (name, slug, version, etc.)
// is kept here too so the file is the single source of truth.

const fs = require("node:fs");
const path = require("node:path");

/**
 * Resolve the API URL for the current build.
 *
 * Dev / staging builds may fall back to http://localhost:8000 for convenience.
 * Production builds MUST ship with a real HTTPS EXPO_PUBLIC_API_URL —
 * otherwise the bundled IPA can't talk to the server and App Store review
 * would reject it for plaintext networking. We throw at config-eval time
 * so the mistake surfaces during `eas build` rather than at runtime.
 */
function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  const isProduction = process.env.APP_ENV === "production";

  if (isProduction) {
    if (!configured) {
      throw new Error(
        "EXPO_PUBLIC_API_URL must be set for production builds (APP_ENV=production)."
      );
    }
    if (!configured.startsWith("https://")) {
      throw new Error(
        `EXPO_PUBLIC_API_URL must use https:// in production builds. Got: ${configured}`
      );
    }
    return configured;
  }

  return configured ?? "http://localhost:8000";
}

// Native Firebase config handling.
//
// - Local dev (Expo Go, missing files): silently omit so `expo config` /
//   `expo start` keep working without the real Google Services files.
// - EAS builds: each platform's config file is enforced ONLY when that
//   platform is actually being built AND Firebase is opted-in for the
//   platform. v1 does not wire any Firebase plugin (no
//   `@react-native-firebase/*`, no Firebase plist or json on disk), so
//   the default is "Firebase not required" — keeping the original
//   strict-throw behavior would have failed every EAS production build
//   on a missing Android file even when only iOS was being built.
//
// "Strict" is detected via APP_ENV (local|staging|production) and via
// EAS_BUILD_PROFILE (EAS sets it to the chosen profile name; `preview` is
// our staging profile per eas.json). Platform is detected via
// EAS_BUILD_PLATFORM, which EAS sets to "ios" or "android" on the build
// worker. Inside an EAS-driven local config eval, EAS_BUILD_PLATFORM is
// usually unset; treat that as "no platform context" and don't enforce
// per-platform Firebase files (the matching `eas build --platform <p>`
// will set it on the build worker and re-trigger the check correctly).
//
// To re-arm the strict throw once Firebase actually lands in v2, set
// `EXPO_FIREBASE_REQUIRED=true` in the relevant EAS profile env. Default
// is off so v1 production iOS builds aren't blocked on a Firebase file
// the v1 code never reads.
function isStrictBuild() {
  const appEnv = process.env.APP_ENV;
  const easProfile = process.env.EAS_BUILD_PROFILE;
  return (
    appEnv === "production" ||
    appEnv === "staging" ||
    easProfile === "production" ||
    easProfile === "preview"
  );
}

function isFirebaseRequired() {
  return process.env.EXPO_FIREBASE_REQUIRED === "true";
}

function shouldEnforceFirebaseFor(platform) {
  if (!isStrictBuild()) return false;
  if (!isFirebaseRequired()) return false;
  const buildPlatform = process.env.EAS_BUILD_PLATFORM;
  // No platform context -> local config inspection. Don't enforce; the
  // real EAS build worker will set EAS_BUILD_PLATFORM and re-check.
  if (!buildPlatform) return false;
  return buildPlatform === platform;
}

function resolveGoogleServicesFile(relativePath, platform) {
  const absolute = path.resolve(__dirname, relativePath);
  if (fs.existsSync(absolute)) {
    return relativePath;
  }
  if (shouldEnforceFirebaseFor(platform)) {
    // Platform-prefixed message so an engineer reading a build log
    // immediately sees which platform's Firebase config is missing
    // and that the requirement is scoped to that platform's
    // production-like EAS builds — not, for example, an iOS build
    // accidentally tripping on an absent Android JSON.
    const platformLabel = platform === "ios" ? "iOS" : "Android";
    throw new Error(
      `Required ${platformLabel} Firebase config file is missing: ${relativePath}. ` +
        `This is only required for ${platformLabel} production-like EAS builds. ` +
        `Provide it via EAS secrets or commit it before building ` +
        `EAS_BUILD_PLATFORM=${platform} with ` +
        `APP_ENV=staging|production (EAS_BUILD_PROFILE=preview|production) ` +
        `and EXPO_FIREBASE_REQUIRED=true.`
    );
  }
  return undefined;
}

/**
 * Google Maps SDK rendering key.
 *
 * IMPORTANT: this is the MOBILE Maps SDK key (renders map tiles on
 * iOS / Android via react-native-maps + PROVIDER_GOOGLE). It is
 * **NOT** the backend GOOGLE_PLACES_API_KEY (Places Web Service —
 * lives on the FastAPI server, never shipped to mobile).
 *
 * Restrictions in Google Cloud Console:
 *   * API: Maps SDK for iOS + Maps SDK for Android only
 *   * Application: iOS bundle ID + Android package + SHA-1
 *   * Same key may be used for both platforms when configured by
 *     bundle ID restriction; use platform-specific keys if a stricter
 *     blast-radius split is required (override below by passing
 *     EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY /
 *     EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY).
 *
 * EXPO_PUBLIC_* means the value is bundled into the mobile JS. The
 * key MUST be application-restricted in GCP so a leaked bundle key
 * can't be reused outside the SportsGang bundle ID. Never paste a
 * real key into source / docs / chat.
 *
 * When unset (local dev, App Store reviewer environment): the picker
 * falls back to PROVIDER_DEFAULT (Apple Maps on iOS, Google native on
 * Android) so the map never goes blank. VenueMapView reads the
 * ``googleMapsConfigured`` flag below to decide.
 */
function resolveMapsKey(platform) {
  const platformKey =
    platform === "ios"
      ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY
      : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
  return platformKey || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || undefined;
}

module.exports = () => {
  const androidGoogleServicesFile = resolveGoogleServicesFile(
    "./google-services.json",
    "android"
  );
  const iosGoogleServicesFile = resolveGoogleServicesFile(
    "./GoogleService-Info.plist",
    "ios"
  );

  const iosMapsKey = resolveMapsKey("ios");
  const androidMapsKey = resolveMapsKey("android");
  // Per-platform flags — VenueMapView gates PROVIDER_GOOGLE on the
  // CURRENT platform's flag, not the union. Configuring only one
  // platform must NOT cause the other platform to switch to
  // PROVIDER_GOOGLE without a native key (blank map risk).
  const googleMapsConfiguredIos = Boolean(iosMapsKey);
  const googleMapsConfiguredAndroid = Boolean(androidMapsKey);

  return {
    expo: {
      name: "SportsGang",
      slug: "protin",
      version: "1.0.0",
      orientation: "portrait",
      // SportsGang is dark-only (near-black canvas, electric-lime accent).
      // "dark" keeps native chrome — alerts, action sheets, keyboard,
      // pickers — consistent with the in-app theme.
      userInterfaceStyle: "dark",
      // SportsGang app icon (lime square with a dark "SG" mark). This is the
      // icon shipped with the v1.0 App Store build; replace `assets/icon.png`
      // to change the store icon in a future release.
      icon: "./assets/icon.png",
      splash: {
        // Matches `SplashScreen.tsx`'s lime background (theme `brand`).
        // Keep these in sync — mismatch causes a visible color flash on cold
        // launch between native splash and the in-app splash component.
        image: "./assets/splash.png",
        backgroundColor: "#C6FF3D",
        resizeMode: "contain",
      },
      assetBundlePatterns: ["**/*"],
      ios: {
        bundleIdentifier: "com.edh1223.protin",
        buildNumber: "1",
        supportsTablet: false,
        infoPlist: {
          NSCalendarsUsageDescription:
            "SportsGang uses your calendar to add confirmed workout sessions.",
          // Foreground-only. We never request always/background — venue
          // sorting only needs a single fix when the picker opens. The
          // copy explicitly names the surface (sports courts, gyms,
          // parks, venues) and re-states the foreground constraint so
          // App Store reviewers can map the request to the permitted
          // use case without inferring it from the key name alone.
          NSLocationWhenInUseUsageDescription:
            "SportsGang uses your location to show nearby sports courts, gyms, parks, and venues. Your location is used only while you are using the app.",
          // Required because expo-notifications is declared in plugins and
          // relies on silent remote push delivery in the background.
          UIBackgroundModes: ["remote-notification"],
        },
        ...(iosGoogleServicesFile
          ? { googleServicesFile: iosGoogleServicesFile }
          : {}),
        // Google Maps SDK key for iOS (tile rendering only — NOT the
        // backend Places key). Omit the config block when no key is
        // configured so iOS falls back to Apple Maps via
        // PROVIDER_DEFAULT — the map will never go blank.
        ...(iosMapsKey
          ? { config: { googleMapsApiKey: iosMapsKey } }
          : {}),
      },
      android: {
        package: "com.edh1223.protin",
        permissions: [
          "READ_CALENDAR",
          "WRITE_CALENDAR",
          "RECEIVE_BOOT_COMPLETED",
          "SCHEDULE_EXACT_ALARM",
          // Foreground location only. ACCESS_BACKGROUND_LOCATION is
          // intentionally absent — venue sorting reads a single fix.
          "ACCESS_FINE_LOCATION",
          "ACCESS_COARSE_LOCATION",
        ],
        ...(androidGoogleServicesFile
          ? { googleServicesFile: androidGoogleServicesFile }
          : {}),
        // Google Maps SDK key for Android (tile rendering only — NOT
        // the backend Places key). Without it, react-native-maps with
        // PROVIDER_GOOGLE renders a blank grey screen, so VenueMapView
        // gates the provider switch on ``googleMapsConfigured``.
        ...(androidMapsKey
          ? { config: { googleMaps: { apiKey: androidMapsKey } } }
          : {}),
      },
      plugins: [
        [
          "expo-notifications",
          {
            icon: "./assets/notification-icon.png",
            color: "#102A43",
            sounds: [],
          },
        ],
        "expo-apple-authentication",
        // Fonts (Inter, Barlow Condensed) are loaded at runtime with
        // useFonts from @expo-google-fonts/*; the plugin entry keeps
        // expo-font's native config in the prebuild.
        "expo-font",
        "@sentry/react-native/expo",
      ],
      // extra values are accessible in the app via Constants.expoConfig.extra
      extra: {
        apiUrl: resolveApiUrl(),
        googleRedirectUri:
          process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI ??
          "http://localhost:8000/users/me/google-calendar/callback",
        // Per-platform Maps SDK configuration flags. The Maps SDK key
        // itself is NOT exposed via ``extra`` because the native config
        // block above is the only place it needs to live; surfacing it
        // to JS would invite accidental misuse. VenueMapView reads
        // these flags AT RUNTIME using Platform.OS to decide between
        // PROVIDER_GOOGLE (key configured for THIS platform — safe to
        // render Google tiles) and PROVIDER_DEFAULT (no key — map must
        // fall back so it never goes blank with Places rows visible).
        //
        // Why both, not one boolean: a build may ship with only the
        // iOS Maps key set. The Android user opening the same OTA
        // bundle must NOT get PROVIDER_GOOGLE without an Android key
        // — that's a blank-map regression. Per-platform flags keep
        // the gate honest on whichever OS is actually running.
        googleMapsConfiguredIos,
        googleMapsConfiguredAndroid,
        // EAS project link. Required for `eas build` because dynamic
        // configs cannot be auto-written by `eas init` — the project ID
        // must live in this file directly.
        eas: {
          projectId: "b36f95b3-3757-4f7e-ab29-08da31cbb00f",
        },
      },
    },
  };
};
