/**
 * Access gate for the published demo.
 *
 * IMPORTANT — this is a doorway, not a lock. MATLens is a static client-side
 * app: there is no server, so the check necessarily runs in the visitor's own
 * browser and anyone willing to open developer tools can walk past it. It keeps
 * a public link from being casually browsable and makes the prototype behave
 * like a real product in a demo. It is not authentication, and nothing behind it
 * should be treated as protected.
 *
 * The credentials are stored as SHA-256 digests so the literal password is not
 * sitting in a public repository in readable form. That raises the effort very
 * slightly; it does not change the paragraph above.
 */

const USERNAME_HASH = 'e3ab9474262aba839a4b5e185acb0daf1ba223d64766560b068d108b6da3d231';
const PASSWORD_HASH = '0835a134fb210a3ea12d679a1db6177e96d882dc5c22bfd9c2a4219d9e430fcc';

export const SESSION_KEY = 'matlens.session';

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const [user, pass] = await Promise.all([sha256(username.trim().toLowerCase()), sha256(password)]);
  return user === USERNAME_HASH && pass === PASSWORD_HASH;
}

/** The session lives for the tab only, so a shared machine does not stay signed in. */
export function hasSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === 'open';
  } catch {
    // Private windows and blocked site data throw on access; treat as signed out.
    return false;
  }
}

export function openSession() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, 'open');
  } catch {
    // Without a store the session simply lasts as long as the React state does.
  }
}

export function closeSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}
