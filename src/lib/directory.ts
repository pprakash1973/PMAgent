/**
 * Organization directory (Active Directory) seam.
 *
 * TODAY: no directory is wired. The admin types UID, name, and email manually,
 * so this resolver returns null and the caller keeps the admin-entered values.
 *
 * PRODUCTION: swap the body of `resolveUserFromDirectory` to call the org AD /
 * Graph API. Entering a UID on the user-creation screen will then auto-populate
 * name and email. No other call site needs to change — this is the only seam.
 */

export interface DirectoryPerson {
  uid: string;
  fullName: string;
  email: string;
}

const UID_PATTERN = /^[A-Za-z0-9]{1,10}$/;

/** Validate the UID format: alphanumeric, 1–10 chars. */
export function isValidUid(uid: string): boolean {
  return UID_PATTERN.test(uid);
}

/**
 * Look up a person in the org directory by UID.
 * Returns null when no directory is configured (current behaviour).
 */
export async function resolveUserFromDirectory(uid: string): Promise<DirectoryPerson | null> {
  void uid; // AD lookup not wired yet — admin supplies name/email manually
  return null;
}
