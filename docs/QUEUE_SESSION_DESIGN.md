# Queue & Playback: Per-Session Design (Implemented)

## Goal

- **Collections** = which albums/slots the jukebox shows (unchanged).
- **Queue + playback state** = per **listener** (per user or per anonymous session), not shared by everyone viewing the same collection.
- Deployed: prefer to scope by **Spotify identity** when available.
- Local: prefer **no required sign-in**; scope by anonymous session when not logged in.

---

## Clarifying questions

Before locking the implementation, a few decisions will help:

### 1. Same person, two devices (e.g. phone + laptop, both with Spotify)

- **Option A – Same queue everywhere**  
  Identify the listener by Spotify user (or app user). Same person on phone and laptop sees the same queue and “now playing” (only one device actually plays audio at a time).
- **Option B – Different queue per device**  
  Identify the listener by “session” (e.g. device/browser). Same person on two devices has two independent queues.

Which do you want for the **deployed** app when the user has connected Spotify: A or B (or “deployed = A, local = B”)?

### 2. Deployed: user has **not** connected Spotify (or not logged in)

- **Option A** – They still get a **personal** queue using an **anonymous session** (e.g. a session id in localStorage). They can add/play/queue until they close the browser (or session expires). No sign-in required.
- **Option B** – They **must** connect Spotify (or sign in) to use the queue at all; otherwise they can only browse the collection.

Which do you prefer?

### 3. Local version: sign-in

- **Option A** – No sign-in. Queue is always scoped by **anonymous session** (one session per browser profile; all tabs in that profile share the same queue).
- **Option B** – Sign-in optional: if they log in, queue is scoped by **user** (and synced across tabs/devices for that user); if not, fall back to session.

Do you want to keep local “no sign-in” (A) or are you open to optional sign-in (B)?

### 4. How to name “who is the listener” in the API

We need a single concept the backend uses to key queue and playback state:

- **Deployed + Spotify connected** → use **Spotify user id** (from the token /me) as the “listener id”. No app login required for queue; Spotify auth is enough.
- **Deployed + no Spotify** → use **anonymous session id** (client sends a UUID, e.g. from localStorage).
- **Local** → use **anonymous session id** (same idea), or **app user id** if we add optional login.

So the backend would treat “listener” as either:

- `spotify_user_id` (when we have a valid Spotify token and call Spotify to get the user id), or  
- `session_id` (when we don’t have Spotify / no login),  
and **queue + playback_state** would be keyed by `(collection_id, listener_scope)` where `listener_scope` is one of those.

Does that match what you have in mind for “user specific or session specific”?

---

## Proposed data model (once we agree on the above)

- **Queue**  
  - Today: `(collection_id, track_id, position, status, …)` with one logical queue per `collection_id`.  
  - New: add a **listener** dimension, e.g. `listener_key` (string): either `spotify:{spotify_user_id}` or `session:{session_id}`.  
  - So: **one queue per (collection_id, listener_key)**.  
  - Same for **PlaybackState**: one row per (collection_id, listener_key) (today it’s one per collection_id with a unique constraint on collection_id; we’d change that to (collection_id, listener_key)).

- **API**  
  - Every queue/playback request would send (or we’d derive):
    - `collection` (and optional `user_slug` for resolving collection) – unchanged.
    - **Listener**: either  
      - `Authorization: Bearer <spotify_access_token>` (or a dedicated header) and backend resolves Spotify user id from token / Spotify /me, or  
      - `X-Session-Id: <uuid>` (or similar) when there’s no Spotify / no login.  
  - Backend then resolves `listener_key` once per request and uses it for all queue and playback_state reads/writes for that request.

- **Frontend**  
  - On load: if we have a Spotify token, backend (or frontend) gets Spotify user id and uses that as listener (no session id needed).  
  - If we don’t have Spotify (or we’re in “anonymous” mode): generate a UUID once per browser profile, store in localStorage, send as `X-Session-Id` (or in body/query if you prefer) on every queue/playback request.

---

## Summary

- **Collections** stay as “which jukebox” (which albums); **queue + playback** become “per listener” via `listener_key` = Spotify user id or session id.
- Deployed: Spotify auth → identify by Spotify user; no Spotify → identify by session id (if we allow anonymous queue).
- Local: identify by session id (no sign-in), or optionally by user id when logged in.
- Once you answer the questions above (same queue across devices? anonymous allowed on deployed? local sign-in optional?), we can lock the exact API (headers vs body, naming) and implement the schema + backend + frontend changes.
