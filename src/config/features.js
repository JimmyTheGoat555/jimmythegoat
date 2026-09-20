// Feature flags — one place to flip. Each flag is imported at the top of
// the components it gates and wraps only their RENDERING, so switching a
// feature back on is one edit here and nothing else; the data, the hooks,
// the callables and the server side stay exactly as they were while it is
// off.
//
// ── ENABLE_EMOTES ────────────────────────────────────────────────────────
// The dance emotes. While false, none of this is on screen:
//   * the Dances shelf in the Gym Shop (GymShop.jsx)
//   * the equipped dance playing on the lobby goat, and the tap that
//     replays it (WorkoutHome.jsx → JimmyAnimation)
//   * play-on-tap of a friend's equipped dance on their profile
//     (PublicFriendProfile.jsx)
//   * the equipped-dance emoji on feed posts (FeedPostCard.jsx)
//   * the Store-tab badge for an owned-but-unequipped dance
//     (utils/storeAlerts.js) — it would point at a shelf that is not there
// The first-workout Silver Lootbox used to be on this list too, because
// its only content was a dance unlock. It hands out the Ball Cap now
// (functions/storeCatalog.js's STARTER_ACCESSORY_ID) and is no longer
// gated on this flag at all.
// Hidden, not removed. The catalogue (data/storeItems.js), the account
// fields (unlockedDances / equippedDance), the equip call, the clips under
// public/animations and the server's first-workout grant are untouched, so
// whatever a user already owns — or is granted meanwhile — is waiting for
// them the moment this is true again.
export const ENABLE_EMOTES = false;
