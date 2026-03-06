# Dive Bar Jukebox — Agent / Context Overview

This document gives enough context for an AI agent or developer to add and change **frontend and backend** features without getting lost in the repo.

---

## 1. What the app is

- **Product**: Retro-style digital jukebox (NSM-style CD wall). Users browse album cards, pick songs via a number pad (e.g. `042-03` = album 42, track 3), and manage a queue. Admin can manage collections, edit albums/tracks, scan a FLAC library, and configure sections/colors.
- **Backend**: Python **FastAPI**, **SQLite**, **SQLAlchemy** ORM, **Alembic** migrations. Serves REST API and streams audio.
- **Frontend**: **React 18**, **TypeScript**, **Vite**. **TanStack Query (React Query)** for server state, **Zustand** for client UI state. **CSS Modules** for styles (`*.module.css`).
- **API base**: Backend at `http://localhost:8000`; frontend dev proxy sends `/api` to it. All backend routes are under `/api/*`.

---

## 2. Backend layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, router includes, lifespan (init_db, ensure "all" collection)
│   ├── config.py            # Pydantic Settings: database_url, music_library_path, cors_origins, etc.
│   ├── database.py          # SQLAlchemy engine, SessionLocal, get_db(), init_db(); some inline SQLite migrations
│   ├── api/
│   │   ├── admin.py         # /api/admin/* — library scan, albums CRUD, tracks update, collections CRUD, sections, settings
│   │   ├── albums.py        # /api/albums/* — get album by id (with optional collection), get tracks
│   │   ├── collections.py   # /api/collections, /api/collections/{slug}, /api/collections/{slug}/albums
│   │   ├── queue.py         # /api/queue — get, add, remove, clear, reorder, add-favorites-random
│   │   ├── playback.py      # /api/playback/* — state, play, pause, stop, skip, position, volume, stream/{trackId}, next-transition
│   │   ├── media.py         # /api/media — serve cover art / media files
│   │   └── settings.py      # /api/settings — get/patch default_collection_slug
│   ├── models/              # SQLAlchemy models (Album, Track, Collection, CollectionAlbum, Queue, PlaybackState, Setting)
│   ├── services/            # Business logic (AlbumService, CollectionService, QueueService, PlaybackService, TrackService)
│   └── utils/               # e.g. metadata_extractor for FLAC scan
├── migrations/versions/     # Alembic migrations (add new migration for schema changes)
└── requirements.txt
```

**Router registration**: In `main.py`, routers are included with no extra prefix; each router sets its own `prefix` (e.g. `APIRouter(prefix="/api/admin", ...)`).

---

## 3. Backend patterns

- **DB session**: Use `db: Session = Depends(get_db)` in route handlers. Never commit in a service without the caller managing the session unless the service is explicitly given the session and is responsible for it.
- **Pydantic request bodies**: Define `class UpdateXRequest(BaseModel)` in the API module (e.g. `admin.py`) with optional fields (`field: type | None = None`). Use in the route as `request: UpdateXRequest`.
- **Ids**: UUIDs as strings for `id` on Album, Track, Collection, etc. URLs use these IDs or slugs (e.g. collection slug).
- **Collection scope**: Most jukebox operations are scoped by **collection** (slug or id). Queue and playback are per-collection.

**Adding a new backend feature (e.g. new field or endpoint):**

1. **Schema change**: Add column to the SQLAlchemy model in `app/models/`. Create an Alembic migration under `backend/migrations/versions/` (revision chain: set `down_revision` to the current head).
2. **API**: Add endpoint in the appropriate `app/api/*.py`; use a Pydantic model for request/response if needed; call `get_db()` and optionally a method in `app/services/`.
3. **Response shape**: Keep response shapes in sync with the frontend types in `frontend/src/types/index.ts` (and with the API client in `frontend/src/services/api.ts`).

---

## 4. Database models (summary)

- **Album**: id, file_path, title, artist, cover_art_path, custom_cover_art_path, total_tracks, year, has_multi_disc, **various_artists**, archived, extra_metadata. Relations: tracks, collection_albums.
- **Track**: id, album_id, file_path, disc_number, track_number, title, artist, duration_ms, enabled, archived, is_favorite, is_recommended. Relations: album, queue_items.
- **Collection**: id, name, slug, description, is_active, sections_enabled, sections (JSON), default_* (sort_order, show_jump_to_bar, jump_button_type, show_color_coding, show_card_background, edit_mode, crossfade_seconds, hit_button_mode). Relations: collection_albums, queue_items, playback_states.
- **CollectionAlbum**: id, collection_id, album_id, display_number, sort_order, enabled_track_ids (JSON). Many-to-many between Collection and Album.
- **Queue / PlaybackState**: Per-collection queue and current playback state.

---

## 5. Frontend layout

```
frontend/src/
├── main.tsx
├── App.tsx                 # Top-level: fetch collections + settings, JukeboxDisplay or AdminPanel by mode
├── types/index.ts          # Shared TS types (Collection, Album, Track, AlbumDetail, QueueItem, PlaybackState, etc.)
├── services/api.ts         # Axios instance (baseURL '/api'), settingsApi, collectionsApi, albumsApi, queueApi, playbackApi, adminApi
├── stores/jukeboxStore.ts  # Zustand: currentCollection, selectedAlbum, queue, playbackState, isAdminMode, numberInput + actions
├── components/
│   ├── JukeboxDisplay.tsx  # Main jukebox: CardCarousel, QueueDisplay, NowPlaying, NumberPad, LCD, settings/jump bar
│   ├── CardCarousel.tsx    # Album cards carousel, section/letter jump buttons, album rows with tracks (AlbumRow), TrackTitle
│   ├── QueueDisplay.tsx
│   ├── NowPlaying.tsx
│   ├── NumberPad.tsx / LCDKeypad.tsx / LCDDisplay.tsx
│   ├── SettingsModal.tsx   # Collection selector, settings panel, edit mode toggle
│   ├── JukeboxSettingsPanel.tsx
│   ├── CollectionSelector.tsx
│   ├── Admin/
│   │   ├── AdminPanel.tsx
│   │   ├── CollectionManager.tsx
│   │   ├── CollectionSections.tsx
│   │   ├── CollectionSettings.tsx
│   │   ├── CollectionEditModal.tsx
│   │   ├── AlbumEditModal.tsx   # Edit album (title, artist, year, various_artists), tracks (title, artist for VA), collections
│   │   ├── LibraryScanner.tsx
│   │   └── SlotManagement.tsx
│   └── ...
└── *.module.css            # One CSS Module per component (e.g. CardCarousel.module.css)
```

- **No React Router routes**: Single app; admin vs jukebox is toggled by `isAdminMode` in the store.
- **Data fetching**: Use `useQuery` for reads and `useMutation` for writes. Invalidate with `queryClient.invalidateQueries({ queryKey: ['...'] })` so lists and details refetch. Query keys are often `['collections']`, `['album-details', albumId]`, `['collection-albums', slug]`, etc.

---

## 6. Frontend patterns

- **Types**: Add or extend interfaces in `frontend/src/types/index.ts`. Keep in sync with backend response shapes and with `api.ts` payloads.
- **API client**: Add or extend methods in `frontend/src/services/api.ts` (e.g. `adminApi.updateAlbum(..., { various_artists })`). Use the same shape as the backend expects.
- **CSS Modules**: Import as `import styles from './Component.module.css'`. Use `className={styles['some-class']}` or `className={clsx(styles.a, condition && styles.b)}`. No global class names; component-scoped.
- **State**: Server state → React Query. Transient UI state (e.g. selected album, number input, admin mode) → Zustand in `jukeboxStore.ts`.
- **Modals**: Implemented as components that receive `onClose` and render overlay + content (e.g. `AlbumEditModal`, `SettingsModal`).

**Adding a new frontend feature:**

1. If the backend adds a field or endpoint: update `types/index.ts` and the right `api.ts` method.
2. Use the new type or API in the relevant component; use `useQuery`/`useMutation` and invalidate the right query keys when data changes.
3. Add or update a CSS Module for the component if you change layout or styling.

---

## 7. Important API ↔ client mappings

- **Collections**: `GET /api/collections` → `collectionsApi.getAll()`; `GET /api/collections/{slug}` → `collectionsApi.getBySlug(slug)`; `GET /api/collections/{slug}/albums` → `collectionsApi.getAlbums(slug)`.
- **Album details (admin)**: `GET /api/admin/albums/{id}` → `adminApi.getAlbumDetails(id)`. Returns album + tracks + collection_ids. Use for edit modal.
- **Album update**: `PUT /api/admin/albums/{id}` with body `{ title?, artist?, year?, various_artists?, archived? }` → `adminApi.updateAlbum(id, data)`.
- **Track update**: `PUT /api/admin/tracks/{id}` with body `{ title?, artist?, enabled?, archived?, is_favorite?, is_recommended? }` → `adminApi.updateTrack(id, data)`.
- **Queue**: All queue endpoints take `collection` (slug). Add: `POST /api/queue` with `{ collection, album_number, track_number }`.
- **Playback**: State and control are per-collection; stream URL is `GET /api/playback/stream/{trackId}`.

---

## 8. Conventions and gotchas

- **Collection slug `"all"`**: Special slug for “All Albums”; created in `main.py` lifespan if missing.
- **Display numbers**: Albums in a collection have a `display_number` (1–999) derived from sort order; used for number-pad input (e.g. `042-03`).
- **Sections**: Collections can have `sections_enabled` and `sections` (order, name, color, start_slot, end_slot). Used for jump-to-section buttons and color coding on cards.
- **Various artists**: Album has `various_artists` boolean. When true, album row shows “ARTIST - Title” per track and the edit album modal shows a per-track artist input. Track artist is editable via `updateTrack` with `artist`.
- **Migrations**: Always add a new migration for schema changes; set `down_revision` to the current head. Avoid duplicate revision IDs across files.
- **Frontend proxy**: Vite proxies `/api` to `http://localhost:8000`; backend must be running for API calls in dev.

---

## 9. Running the app

- **Backend**: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`
- **Frontend**: `cd frontend && npm run dev` (default `http://localhost:5173`)
- **Migrations**: `cd backend && alembic upgrade head`

Use this overview to add endpoints, fields, and UI features in a consistent way across backend and frontend.
