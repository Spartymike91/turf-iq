// Which versions of the legal pages people are agreeing to. Use the "Last
// updated" date shown on /terms and /privacy, and change it here whenever
// either page's wording changes. Past wording is kept in git history.
export const TERMS_VERSION = "2026-07-29";
export const PRIVACY_VERSION = "2026-07-29";

// When true, a signed-in user with no record for the current versions has to
// agree before using the app. Leave off until the attorneys' final documents
// are posted, so nobody is asked to accept the drafts.
export const ASK_EXISTING_USERS = false;

export type AcceptanceSource = "signup" | "invite" | "prompt";
