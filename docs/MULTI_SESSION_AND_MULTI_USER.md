# Multiple Sessions & Multiple Users

## How queue and playback are stored

- **Queue** and **playback state** (current track, is_playing, position) are stored **on the backend**, keyed by **collection** only (via `collection_id`).
- The collection is identified by the URL: `/:user_slug/:collection_slug` (e.g. `/dfranklin/the-motivator`). So there is **one queue per collection** (one per “jukebox” at that URL).
- There is **no per-browser or per-tab state** for the queue. Every client that loads the same URL talks to the same backend queue and playback state.

So when you:

1. Open the jukebox in **Chrome** at `/dfranklin/the-motivator`, add songs, then pause.
2. Open **Safari** and go to the same URL.

Safari shows the **same** queue and **same** playback state (paused, same current track) because it’s just reading the same backend data. That’s expected: there is a single shared queue per collection.

---

## Is this an issue?

### Same person, multiple tabs or browsers (e.g. Chrome + Safari)

- **Intended:** All tabs/browsers viewing the same collection URL see the same queue and playback state.
- **Caveat:** The **actual audio** is played by one client at a time:
  - **Spotify:** One Spotify device is active; the Web Playback SDK in one tab controls it. Playing in another tab can transfer playback to that tab’s “device.”
  - **Local (HTML5 audio):** Audio plays in one tab; other tabs only show state. Who “has” playback is not coordinated by the backend.
- So: state is shared and correct; who actually plays sound can differ by tab. For a single “main” screen plus other devices just viewing, this is usually fine.

### Multiple different users on the deployed jukebox

- **Current behavior:** Anyone who visits the **same** URL (e.g. `https://yoursite.com/dfranklin/the-motivator`) shares:
  - The **same queue**
  - The **same** “now playing” and play/pause state
- So:
  - **If you want a “shared” jukebox** (e.g. one TV + several phones all seeing the same queue and controlling it): the current design matches that. Everyone sees and affects the same queue and playback.
  - **If you want each person to have their own queue** (e.g. “my queue” vs “your queue”): the app does **not** do that today. Queue is per collection (per URL), not per user or per session.

### Implications for deployment

- **One shared jukebox per collection URL:** Works as-is. Multiple users = multiple people controlling one queue and one playback state. Only one playback output (e.g. one Spotify device or one browser tab) actually plays at a time.
- **Per-user or per-session queues:** Would require a design change (e.g. queue keyed by user or by session id, and UI/API to support “my queue” vs “room queue”).

---

## Summary

| Scenario | What happens |
|----------|----------------|
| Same URL, Chrome and Safari | Same queue and playback state in both; audio plays in one place (Spotify device or one tab). |
| Multiple users, same URL (e.g. shared link) | Everyone shares one queue and one playback state; any of them can add/remove, play, pause, skip. |
| Multiple users, different URLs (e.g. `/userA/bar` vs `/userB/bar`) | Separate queues and playback state per collection (per URL). |

So the behavior you saw (same queue in Safari as in Chrome) is by design. Whether it’s “an issue” for the deployed jukebox depends on whether you want one shared jukebox per collection (current) or per-user queues (would need new backend/API and possibly UI).
