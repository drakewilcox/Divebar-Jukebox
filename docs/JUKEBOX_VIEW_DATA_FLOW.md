# Jukebox View – Data Flow & API Overview

This doc describes how the jukebox page fetches data, adds to queue, triggers playback, and tracks progress. It also notes inefficiencies and best-practice improvements.

---

## 1. Initial Load (Page Enter)

When you open `/:user_slug/:collection_slug` (e.g. `/drakewilcox/the-motivator`), these requests run:

| Request | Where | Purpose |
|--------|--------|--------|
| `GET /api/users/{user_slug}/collections/{collection_slug}` | JukeboxPage | Single collection metadata (name, slug, settings). |
| `GET /api/users/{user_slug}/collections` | JukeboxPage | List of collections for dropdown (e.g. in Settings). |
| `GET /api/config` | JukeboxDisplay | `enable_local_library` (and similar flags). |
| `GET /api/collections/{slug}/albums?user_slug=...` | JukeboxDisplay | **All albums in the collection** (id, title, artist, cover URLs, display_number). Used for carousel cards and covers. |
| `GET /api/collections/{slug}?user_slug=...` | JukeboxDisplay | Refetch collection for latest `default_*` (e.g. jump button type). |
| `GET /api/queue?collection=...&user_slug=...` | JukeboxDisplay + CardCarousel + QueueDisplay | Queue list. **Shared query key** → one request, multiple subscribers. |
| `GET /api/playback/state?collection=...&user_slug=...` | JukeboxDisplay + CardCarousel + QueueDisplay + NowPlaying | Playback state (current track, is_playing, position). **Shared query key** → one request. |

**Album cards (track lists):** Each visible album card needs full track list. That is **not** in the collection-albums response. The frontend uses:

| Request | Where | Purpose |
|--------|--------|--------|
| `GET /api/albums?ids=id1,id2,...&collection=...&user_slug=...` | CardCarousel (prefetch) | **Batch** album details + tracks for up to 20 IDs in one call. |
| `GET /api/albums/{album_id}?collection=...&user_slug=...` | CardCarousel AlbumRow (fallback) | Single album when not in batch cache (e.g. scrolled to a card that wasn’t prefetched). |

- **On load:** One batch request for the **first 8** album IDs + **next 2** (next slide). Response is written into the React Query cache per album; visible cards read from cache.
- **When sliding:** One batch request for the **next 2** album IDs (and on first slide, the first 8). Same cache write; cards use cached data when available.
- **When a card wasn’t prefetched:** That card’s `useQuery` runs and does a single `GET /api/albums/{id}`.

So: **one** list of albums (with covers), then **one batch request** for prefetched cards (up to 10 IDs), and only **single** album requests for cards that weren’t in the batch.

---

## 2. Displaying Data on the Cards

- **Covers and basic info (title, artist, slot number):** From the single **collection-albums** response. No per-card request.
- **Track list and per-track metadata:** From **album-details** (batch or single endpoint). Each card has `useQuery(['album-details', album.id, collection.slug, userSlug])` with 5 min `staleTime`; prefetch fills the cache via batch, so cards read from cache when available.

---
## 2b. Where card data is stored (no local state)

Album/card data is **not** copied into component `useState`. It lives only in **React Query's cache** (server state):

| Data | Stored in | Refetched? |
|------|-----------|------------|
| Collection list | `['user-collections', userSlug]` | On mount / when userSlug changes. |
| Albums in collection (covers, titles, display_number) | `['collection-albums', collection.slug, userSlug]` | On mount / when collection changes. |
| Album details (tracks, etc.) | `['album-details', album.id, collection.slug, userSlug]` | Only when cache is empty or after 5 min stale; prefetch and batch fill the cache. |
| Queue | `['queue', collection.slug, userSlug]` | Polling every 2s only when queue has items. |
| Playback state | `['playback-state', collection.slug, userSlug]` | Polling every 1s only when playing. |

So for the jukebox session, **album list and album details are effectively static**: one load (or batch prefetch), then read from cache. Only queue and playback state are "live" (polled). Album data is invalidated only when the user edits an album in the admin panel.


Implemented: batch album-details endpoint; see §1 and §2.

---

## 3. Adding Songs to the Queue

| Action | Request | Where |
|--------|--------|--------|
| Add one track (keypad XXX-YY or card click) | `POST /api/queue` body: `{ collection, album_number, track_number, user_slug? }` | CardCarousel `addToQueueMutation` |
| Add 10 random (“Hit”) | `POST /api/queue/add-favorites-random` body: `{ collection, count: 10, mode, user_slug?, section_*? }` | CardCarousel `addFavoritesRandomMutation` |

After a successful add, the frontend calls `queryClient.invalidateQueries({ queryKey: ['queue', ...] })`, so the shared queue query refetches once and all subscribers (JukeboxDisplay, CardCarousel, QueueDisplay) see the new queue. No duplicate queue requests.

---

## 4. Triggering Playback

| Action | Request | Where |
|--------|--------|--------|
| Play | `POST /api/playback/play` | QueueDisplay, NowPlaying, JukeboxDisplay (auto-start when queue gains first item). |
| Pause | `POST /api/playback/pause` | QueueDisplay, NowPlaying. |
| Skip | `POST /api/playback/skip` | QueueDisplay, NowPlaying, JukeboxDisplay (SpotifyPlaybackSync onTrackEnd), CardCarousel (skip button). |
| Stop | `POST /api/playback/stop` | QueueDisplay, SettingsModal (on collection switch). |
| Clear queue | `DELETE /api/queue?collection=...` | QueueDisplay (Stop), SettingsModal. |

After each of these, the frontend invalidates `['playback-state', ...]` and usually `['queue', ...]`, so one refetch each. In Spotify mode, **SpotifyPlaybackSync** also calls the Spotify Web API / SDK (transfer device, start playback) based on backend state; the backend is still the source of truth for “current track” and “is_playing.”

---

## 5. Tracking Track Progress

Two separate mechanisms:

**A) Backend state (for “what’s playing”)**

- `GET /api/playback/state` returns `current_track_id`, `is_playing`, `current_position_ms`, `current_track` (title, artist, duration, etc.).
- When **playing**, the frontend uses **refetchInterval** so this is polled every **1 second** (only when `is_playing` is true; otherwise no polling).
- Backend `current_position_ms` is updated when the client calls `POST /api/playback/position` (e.g. seek). For **local** playback the backend may not get frequent position updates; for **Spotify** the backend does not receive position from Spotify – it’s client-side only.

**B) Live progress bar (smooth UI)**

- **Local:** `audioService.getCurrentTime() * 1000` is read on a **100ms** `setInterval` in CardCarousel and QueueDisplay.
- **Spotify:** `getSpotifyPlayer().getCurrentState()` is read on a **100ms** `setInterval`; `state.position` is used for the progress bar.

So: **progress bar** = local/SDK only (no extra backend calls). **Backend** = “current track” and “is_playing” (and optionally stored position for seek). The 1s polling of `GET /api/playback/state` when playing is only to keep “now playing” and “is_playing” in sync across tabs and with the backend; it is not used for the smooth progress bar.

---

## 6. Who Fetches Queue & Playback State?

Multiple components use the **same** query keys:

- **Queue** `['queue', collection.slug, userSlug]`: JukeboxDisplay, CardCarousel, QueueDisplay.
- **Playback state** `['playback-state', collection.slug, userSlug]`: JukeboxDisplay, CardCarousel, QueueDisplay, NowPlaying.

React Query deduplicates by key: only **one** in-flight request per key, and all components share the same cached data. So we are **not** sending duplicate network requests; we just have several subscribers. That’s efficient.

Polling is conditional:

- **Queue:** `refetchInterval` is `2000` (2s) only when `query.state.data.length > 0`; otherwise `false` (no polling).
- **Playback state:** `refetchInterval` is `1000` (1s) only when `query.state.data?.is_playing`; otherwise `false`.

So when the queue is empty and nothing is playing, **no** repeated calls to `/api/queue` or `/api/playback/state`.

---

## 7. Summary Table (Jukebox View Only)

| Data | How it’s fetched | When it’s requested again |
|------|-------------------|----------------------------|
| Collection (one) | GET user collection by slug | On page/route load. |
| Collections list | GET user collections | On page load. |
| Config | GET /config | On load (no refetch). |
| Albums in collection (list + covers) | GET collection albums | On load; optional refetch on invalidation. |
| Collection (for defaults) | GET collection by slug | On load. |
| Album details (tracks) | GET /albums/{id} per album | On card visibility + prefetch (first 8, next 2); cache 5 min. |
| Queue | GET /queue | On load; then poll every 2s **only if queue not empty**; + after add/remove/clear/skip. |
| Playback state | GET /playback/state | On load; then poll every 1s **only if playing**; + after play/pause/skip/stop. |
| Progress bar (ms) | No backend call | 100ms timer from SDK (Spotify) or audioService (local). |

---

## 8. Inefficiencies & Recommendations

**Current inefficiencies**

1. **Album-detail requests:** Prefetch now uses a single batch `GET /api/albums?ids=...` for up to 10 IDs on load/slide; only cards not in the batch trigger a single `GET /api/albums/{id}`. Backend is optimized (single DB row for enabled tracks per album).
2. **Duplicate subscribers, same data:** Queue and playback state are subscribed in 3–4 components. This is **not** duplicate network traffic (same query key), but the pattern is a bit scattered. Could centralize in one place and pass data down if you want a single “source of truth” in code.
3. **Progress:** Backend `current_position_ms` is not updated in real time for Spotify (client doesn’t POST position every second). So when playing Spotify, the backend’s `current_position_ms` can be stale. The UI is correct because it uses the SDK. If you ever need “last known position” on the server (e.g. resume), you’d need the client to send position periodically or on pause/seek.

**Best-practice–aligned improvements**

1. **Batch album details:** Implemented. `GET /api/albums?ids=id1,id2,...` (max 20) is used for prefetch; frontend requests the first 8 + next 2 IDs in one call and populates the cache.
2. **Keep conditional polling:** Already done: no polling when queue is empty and not playing.
3. **Single source for queue/playback in UI:** Consider one “jukebox state” provider (or a small set of hooks) that own the queue and playback-state queries and pass data + mutations down. Same network behavior, clearer data flow.
4. **Stale-while-revalidate:** You already use `staleTime` for album details. For queue/playback, React Query’s default “refetch on window focus” is reasonable; you could set `staleTime: 1000` for playback state when playing so you don’t refetch more than once per second if multiple components trigger refetches.

---

## 9. Request Checklist (Quick Reference)

**On jukebox load (empty queue, not playing):**

- GET user collection (1)
- GET user collections (1)
- GET config (1)
- GET collection albums (1)
- GET collection by slug (1)
- GET queue (1)
- GET playback/state (1)
- GET /api/albums/{id} × 8–10 (prefetch)

**When user adds one track:**

- POST /queue (1)
- Then 1 refetch of queue (invalidation).

**When queue gets first item (auto-play):**

- POST /playback/play (1)
- Then refetch playback-state (and optionally queue).

**While playing:**

- GET /playback/state every 1s (polling).
- GET /queue every 2s (polling).
- No extra requests for progress bar (SDK / audioService only).

**When user skips / stops / clears:**

- POST playback/skip or playback/stop, DELETE /queue (as needed), then invalidate queue + playback-state → one refetch each.
