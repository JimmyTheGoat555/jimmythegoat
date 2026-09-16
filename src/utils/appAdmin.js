// Who the app's Admin screens are shown to.
//
// THIS IS NOT A SECURITY BOUNDARY, and it is important to be precise
// about that. Everything here runs on the user's own device, in a bundle
// they can read and a runtime they can edit. Anyone can make this return
// true for themselves; what they get for it is an empty dashboard, because
// the data behind it comes from the `adminAnalytics` callable, which
// re-checks the caller's uid against Auth on the server and returns
// nothing to anybody else (see functions/appAdmin.js). That is the gate.
// This is a visibility rule — it decides whether a menu entry exists, not
// whether the numbers do.
//
// TWIN CONSTANT. The authoritative copy is ADMIN_EMAIL in
// functions/appAdmin.js. They must agree, and the same twin-catalog
// discipline applies here as to src/data ↔ functions: changing one without
// the other shows an admin a door that will not open, or hides a door from
// the person who owns it.
export const ADMIN_EMAIL = 'jimmythegoat.app@gmail.com';

// Lowercased before comparing: Firebase preserves whatever case the
// address was typed in at signup, and "Jimmythegoat.app@gmail.com" is the
// same mailbox.
export function isAppAdmin(email) {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}
