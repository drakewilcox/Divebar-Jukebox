# Dive Bar Jukebox

A retro-style digital jukebox application that replicates the look and feel of 90s/early 2000s NSM-style CD wall jukeboxes.

## Features

- **Local FLAC File Support**: Play high-quality FLAC files from your music library
- **Multi-Collection Management**: Create multiple jukebox "versions" (e.g., "Dive Bar Jukebox", "Dad Rock Jukebox")
- **Flexible Album Numbering**: Dynamic display numbers (001-999) based on sort order
- **Selective Track Inclusion**: Enable/disable specific tracks per collection
- **Retro UI**: NSM-style card carousel interface with number pad input
- **Multi-Disc Support**: Properly handles albums with multiple discs

## Architecture

- **Backend**: Python FastAPI with SQLite database
- **Frontend**: React + TypeScript + Vite
- **Music Sources**: Local FLAC files (Spotify/Tidal support planned)
- **Deployment**: Local web app, Raspberry Pi standalone (future), hosted demo (future)

## Project Structure

```
divebar-jukebox/
├── backend/           # FastAPI backend
├── frontend/          # React frontend
├── tools/             # Utility scripts (tidal-dl-helper)
├── collections/       # Collection configuration files
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- FLAC music library

### Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env.example .env
# Edit .env with your music library path
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Access the application at `http://localhost:5173`

## Music Library Structure

The application expects FLAC files organized as:

```
MusicLibrary/Albums/
├── Artist Name/
│   ├── Album Name/
│   │   ├── 01 - Track.flac
│   │   ├── 02 - Track.flac
│   │   └── cover.jpg
│   └── Multi-Disc Album/
│       ├── Disc 1/
│       │   ├── 01 - Track.flac
│       │   └── ...
│       └── Disc 2/
│           ├── 01 - Track.flac
│           └── ...
```

## Collection Configuration

Collections are defined in `collections/collections.json`:

```json
{
  "collections": [
    {
      "name": "Dive Bar Jukebox",
      "slug": "dive-bar",
      "description": "Classic dive bar selection",
      "albums": [
        {
          "album_path": "Artist Name/Album Name",
          "sort_order": 1,
          "enabled_tracks": ["all"],
          "disabled_tracks": []
        }
      ]
    }
  ]
}
```

## Tools

### Tidal-DL Helper Scripts

Located in `tools/tidal-dl-helper-scripts/`, these scripts help you:
- Fetch saved albums from Spotify and Tidal
- Resolve albums on Tidal
- Batch download FLAC files via tidal-dl-ng

See `tools/tidal-dl-helper-scripts/README.md` for detailed usage.

## Current To-Do List

### Bug Fixes & Data Issues
- [x] Fix track number display issues for multi-disc albums
- [x] Implement logic for track number display when some tracks are hidden
- [x] Fix issue with uneven album amounts, and show blank slots if needed. 
- [x] Fix issue when only one album or no albums are in a collection. 
- [x] Fix Queue issue: adding a track to the queue does not always put it last (seen when an album was in the queue)
- [ ] Examine Library Scan process and possible issues. 
- [ ] Playback of the first song in Queue is really abrupt, maybe a fade in or delay? 
- [ ] look into if mp3 files will work as well

### Admin Features
- [ ] Add ability to add custom artwork to an album in edit modal
- [ ] Add ability to filter by active in collection list
- [ ] Add ability to preview individual tracks in edit modal. 
- [ ] Add authorization to admin features

### Sorting & Organization
- [ ] Create solution for custom sorting of albums within collections
- [ ] Set default sort order to alphabetical for collections026
- [ ] Create settings modal with collection selector, default collection, sort options (A-Z, Genre, Custom), and A-Z jump navigation

### Track Features
- [ ] Add stars and dots/+ system next to tracks for favorites and recommendations
- [ ] Add track preview playback feature in album edit modal for listening while editing/starring

### Playback Features
- [ ] Implement random play feature (possibly favorites-only) that can be toggled in settings
- [ ] Add 'play random after queue ends' feature
- [ ] Add a "Fade" Amount Feature for how much transition is between tracks
- [ ] Add a feature for creating custom queue lists (basically a playlist) per collection. 
- [ ] in addition to this, maybe create the ability to record the Queue History, and then save that history as queue collection. 


### Visual Enhancements
- [ ] Add paper textures to album info cards for vintage jukebox aesthetic
- [ ] Add more stylistic elements to make UI look more like a vintage jukebox
- [ ] Implement variable spacing and text sizing for track names to fill the area better
- [ ] Enhance carousel slider animations for smoother transitions
- [ ] Work on making Logo look more like an NSM jukebox. 
- [ ] add a speaker icon for currently playing track in track info card
- [ ] add an icon to represent that a song is already in the queue (maybe prevent duplicates)

### UI Features
- [x] Setup edit mode in the carousel for quick album management
- [ ] Add now playing to carousel controls
- [ ] Clicking outside of Queue sidebar should close sidebar
- [ ] Maybe have 4 arrow controls. Two single arrow buttons, and two double arrow buttons. The double arrow buttons would slide two cards at once. 
- [ ] Improve card sliding speed, or just ability to press the buttons faster, not necessarily faster sliding speed. 
- [ ] Move album Number back to album info card at top left.

### Integration & Infrastructure
- [ ] Add ability to add playlists as albums
- [ ] Implement Spotify integration for playback and metadata
- [ ] Move music library to network harddrive and ensure compatibility

### Testing & Deployment
- [ ] Test application on physical iPad (1024x768)
- [ ] Initialize git repository and create initial commits

## Development Roadmap

### Phase 1: MVP (Current)
- [x] Project structure
- [x] Backend with FLAC scanner
- [x] Collection management
- [x] Basic jukebox UI
- [x] Local playback

### Phase 2: Enhanced Features
- [x] Admin interface
- [x] Advanced collection management
- [ ] Search and filtering and Sorting

### Phase 3: Raspberry Pi
- [ ] GPIO hardware controls
- [ ] Touch screen interface
- [ ] Kiosk mode setup

### Phase 4: Hosted Demo
- [ ] Multi-user support
- [ ] Cloud deployment
- [ ] Spotify/Tidal integration

## License

MIT

## Contributing

This is a personal project, but suggestions and feedback are welcome!
