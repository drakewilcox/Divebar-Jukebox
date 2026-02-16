# Dive Bar Jukebox - Frontend

React + TypeScript + Vite frontend for the Dive Bar Jukebox application.

## Development

```bash
npm install
npm run dev
```

The development server will start on `http://localhost:5173` and proxy API requests to the backend at `http://localhost:8000`.

## Build

```bash
npm run build
```

Build output will be in the `dist/` directory.

## Features

- **Collection Selection**: Switch between different jukebox collections
- **Album Carousel**: Browse albums with smooth animations
- **Number Pad**: Classic jukebox input (XXX-YY format)
- **Queue Display**: See what's playing and what's coming up
- **Now Playing**: Current track with playback controls
- **Admin Panel**: Scan library and manage collections

## Technologies

- React 18
- TypeScript
- Vite
- TanStack Query (React Query)
- Zustand (State Management)
- Axios (API Client)

## Project Structure

```
src/
├── components/       # React components
│   ├── Admin/       # Admin interface
│   ├── AlbumCard.tsx
│   ├── CardCarousel.tsx
│   ├── CollectionSelector.tsx
│   ├── JukeboxDisplay.tsx
│   ├── NowPlaying.tsx
│   ├── NumberPad.tsx
│   └── QueueDisplay.tsx
├── services/        # API and audio services
│   ├── api.ts
│   └── audio.ts
├── stores/          # Zustand stores
│   └── jukeboxStore.ts
├── types/           # TypeScript types
│   └── index.ts
├── App.tsx          # Main app component
└── main.tsx         # Entry point
```
