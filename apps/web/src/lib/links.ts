/**
 * Public destinations used by the page. Each was checked on 4 Oct 2026
 * (docs/run-golf-v2/web-refresh/IMPLEMENTATION_REPORT.md, "Link verification"):
 *
 * - App Store: Apple's public lookup for app ID 6767027447 (the `ascAppId`
 *   in apps/mobile/eas.json) returns "SportsGang", bundle
 *   com.edh1223.protin, in the AU and US storefronts.
 * - Privacy / Terms / Support: the URLs recorded for the app in
 *   docs/release/APP_STORE_METADATA.md §8 (and apps/mobile/.env.example);
 *   the App Store record's seller URL is the same site. Which URLs the
 *   shipped binary was built with is not recorded in the repo. They are
 *   hosted by a separate static site; see RELEASE_HANDOFF.md before
 *   replacing that host with this build.
 */
export const APP_STORE_URL = 'https://apps.apple.com/au/app/sportsgang/id6767027447';

export const PRIVACY_URL = 'https://sportgang.netlify.app/privacy/';
export const TERMS_URL = 'https://sportgang.netlify.app/terms/';
export const SUPPORT_URL = 'https://sportgang.netlify.app/support/';
