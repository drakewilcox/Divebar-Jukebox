# Dive Bar Jukebox

A retro-style digital jukebox application that replicates the look and feel of 90s/early 2000s NSM-style CD wall jukeboxes.

![Jukebox screenshot](images/divebarJukePreview.png)

## Features

### Admin Features
- **Local FLAC File Support**: Play high-quality FLAC files from a local library
- **Spotify Sync**: Includes tools and scripts for building JSON files and scripts of your Saved Music on Spotify and Tidal to be easily used with solutions like tital-dl-ng and SpotiFLAC if desired. 
- **Library Scan**: Scans and updates local music library and updates SQL database, so that all Display data for Albums and Tracks can be edited while file metadata goes unchanged. 
- **Multi-Collection Management**: Create multiple jukebox Collections, that can feature a different set of Albums
- **Flexible Album Numbering**: Dynamic display numbers (001-999) based on sort order
- **Selective Track Inclusion**: Each album shown in the Jukbox can be edited so that only selected tracks display.
- **Favorites and Recommendations**: Songs can be marked as "Favorite" or "Recommended", to be displayed to the user on info cards while searching for songs. Songs marked as "Favorite" will also be included in Autoplay feature. 
- **Edit Modal Track Player**: Admin users can listen to individual tracks and use progress bar to preview different sections of songs while choosing favorites and selecting songs. 

### User Interface / Jukebox View
- **Jukebox View**: The main jukebox view is built to be used on Horizontal iPad Screens, Desktops, or touch screen interfaces. 
- **Controls** The UX is intended to replicate the simplicity, and primitive controls of a vintage jukebox. With left/right arrow keys for flipping through Cards, and a pop out number pad for selecting songs for the Queue. 


## Architecture
- **Backend**: Python FastAPI with SQLite database
- **Frontend**: React + TypeScript + Vite
- **Music Sources**: Local FLAC files (Spotify/Tidal support planned)
- **Deployment**: Local web app, Raspberry Pi standalone (future), hosted demo (future)


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

## Tools

### Tidal-DL Helper Scripts

Located in `tools/tidal-dl-helper-scripts/`, these scripts help you:
- Fetch saved albums from Spotify and Tidal using 
- Resolve albums on Tidal
- Batch download FLAC files via tools such as tidal-dl-ng

See `tools/tidal-dl-helper-scripts/README.md` for detailed usage.

## Current To-Do List

### Bug Fixes & Data Issues
- [x] Fix track number display issues for multi-disc albums
- [x] Implement logic for track number display when some tracks are hidden
- [x] Fix issue with uneven album amounts, and show blank slots if needed. 
- [x] Fix issue when only one album or no albums are in a collection. 
- [x] Fix Queue issue: adding a track to the queue does not always put it last (seen when an album was in the queue)
- [x] Examine Library Scan process and possible issues. 
- [ ] Playback of the first song in Queue is really abrupt, maybe a fade in or delay? 
- [ ] Add Support for mp3 file playback
- [x] Clear Queue when user switches collections 
- [x] Fix Edit Album Modal form state issue (Album Name not holding state)
- [ ] Star and recommended icons should append to a word so they dont break a line. 
- [ ] Star and Recommended should possibly still display on songs with long titles. 

### Admin Features
- [ ] Add ability to add and save custom artwork to an album in edit modal
- [x] Add ability to filter by active in collection list
- [x] Add functionality for searching collection and library to Admin View
- [x] Add ability to preview individual tracks in edit modal. 
- [ ] Add authorization to admin features
- [x] Add track duration to Edit Modal
- [ ] Add an archive track button in addition to Hide. Hide means it is hidden from display, but will still play during Full Album Play. Archive means it will not play or display.
- [ ] Add a apply leveling feature to settings modal. 

### Database Updates
- [x] Add Architecture for Collection Sections

### Sorting & Organization
- [x] Create solution for custom sorting of albums within collections
- [x] Create Settings Modal
- [x] Move collection selector, Admin settings button and edit mode selector to settings modal
- [x] Add sort options (A-Z, Custom) to settings modal
- [x] Add Jump-To Functionality to Jukebox View

### Track Features
- [x] Add stars and dots/+ system next to tracks for favorites and recommendations
- [x] Add track preview playback feature in album edit modal for listening while editing/starring
- [x] Add Playback display to control bar, and move Queue Display above this. 
- [x] Add Green LCD effect to mini playback display and album image 
- [x] Make sure playblack and Queue use Database track data, not metadata 

### Playback Features
- [x] Implement random play feature that are triggered by "H" button on keypad. 
- [ ] Add 'play random after queue ends' feature to be toggled in settings. 
- [ ] Add a "Fade" Amount Feature for how much transition is between tracks
- [ ] Add feature for creating custom queue lists (basically a playlist) per collection. 
- [ ] in addition to this, maybe create the ability to record the Queue History, and then save that history as queue collection.
- [x] import replay-gain from track meta data and implement in playback. 


### Visual Enhancements
- [x] Add paper textures to album info cards for vintage jukebox aesthetic
- [x] Add more stylistic elements to make UI look more like a vintage jukebox
- [x] Implement variable spacing and text sizing for track names to fill the area better
- [x] Improve dynamic display sizing, and account for browser header
- [ ] Add Year to Album info card
- [x] Add Selection Number (ie. "002-03") to Jukebox playblack display
- [x] Add descriptions underneath number input for what each number means 
- [ ] Enhance carousel slider animations for smoother transitions
- [x] add a speaker icon for currently playing track in track info card
- [x] add an icon to represent that a song is already in the queue (maybe prevent duplicates)
- [ ] Update Card Sliders to make them look like "Card Holders" seen on NSM Jukeboxes

### UI Features
- [x] Setup edit mode in the carousel for quick album management
- [x] Add now playing to carousel controls
- [x] Clicking outside of Queue sidebar should close sidebar
- [ ] Add option to have 4 arrow controls. Two single arrow buttons, and two double arrow buttons. The double arrow buttons would slide two cards at once. 

### Integration & Infrastructure
- [ ] Add ability to add playlists as albums
- [ ] Implement Spotify integration for playback and metadata
- [ ] Implement Spotify sync to add spotify URLs to albums, and fetching all Spotify IDs for all tracks in database. 
- [ ] Move music library to network harddrive and ensure compatibility.

### Testing & Deployment
- [x] Test application on physical iPad (1024x768)
- [ ] Add Unit Testing
- [ ] Set up deployment scripts for creating a deployed version of the Database that uses Spotify API
- [ ] Create a copy of database for deployment for syncing all of the album database changes done locally

## Development Roadmap

### Phase 1: MVP (Current)
- [x] Project structure
- [x] Backend with FLAC scanner
- [x] Collection management
- [x] Basic jukebox UI
- [x] Local playback
- [x] Custom Sort Functionality

### Phase 2: Enhanced Features
- [x] Admin interface
- [x] Advanced collection management
- [x] Search and filtering and Sorting

### Phase 3: Raspberry Pi
- [ ] GPIO hardware controls
- [ ] Touch screen interface
- [ ] Kiosk mode setup

### Phase 4: Hosted Demo
- [ ] Multi-user support
- [ ] Cloud deployment
- [ ] Spotify/Tidal integration

## Disclaimer

This project does not include or distribute any third-party download or ripping software. References to tools (e.g. for syncing or downloading from streaming services) are for informational purposes only. You are solely responsible for ensuring your use of this software and any tools you use with it complies with applicable laws and the terms of service of any third-party services. The authors and contributors of this project are not responsible for how you use this software or for any misuse of third-party services.

## License

MIT

## Contributing

This is a personal project.
