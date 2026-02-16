# Getting Started with Dive Bar Jukebox

## Prerequisites

- Python 3.11+
- Node.js 18+
- FLAC music library

## Initial Setup

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env to set your music library path
# MUSIC_LIBRARY_PATH=/Volumes/SamsungT7/MusicLibrary/Albums

# Run database migrations (already done, but can be rerun)
alembic upgrade head

# Start the backend server
python -m app.main
```

The backend API will be available at `http://localhost:8000`
API documentation at `http://localhost:8000/docs`

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at `http://localhost:5173`

## First Steps

### 1. Scan Your Music Library

1. Open the app at `http://localhost:5173`
2. Click "⚙️ Admin Mode" button at the bottom
3. Go to "Library Scanner" tab
4. Click "🔍 Scan Library"
5. Wait for the scan to complete

This will import all your FLAC albums from your music library into the database.

### 2. Configure Collections

Collections are defined in `collections/collections.json`. Edit this file to add albums to your jukebox collections.

Example:

```json
{
  "collections": [
    {
      "name": "Dive Bar Jukebox",
      "slug": "dive-bar",
      "description": "Classic dive bar selection",
      "albums": [
        {
          "album_path": "The Beatles/Abbey Road",
          "sort_order": 1,
          "enabled_tracks": ["all"],
          "disabled_tracks": []
        },
        {
          "album_path": "Pink Floyd/The Dark Side of the Moon",
          "sort_order": 2,
          "enabled_tracks": ["all"],
          "disabled_tracks": []
        }
      ]
    }
  ]
}
```

**Important:** The `album_path` must match the relative path from your music library root.

### 3. Sync Collections

After editing `collections.json`:

1. Go to Admin Mode → Library Scanner tab
2. Click "🔄 Sync Collections"

Your collections will now be loaded and ready to use!

### 4. Use the Jukebox

1. Click "🎵 Jukebox Mode" to exit admin mode
2. Select a collection from the dropdown
3. Browse albums using the carousel arrows
4. Use the number pad to add songs:
   - Enter album number (001-999) + track number (01-99)
   - Example: `00103` = Album 1, Track 3
   - Enter `00100` or just `001` = Play entire Album 1
5. Click "Add to Queue"
6. Press play on the Now Playing section

## Music Library Structure

Your music library should be organized as:

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

## Troubleshooting

### Backend won't start

- Check that your music library path in `.env` is correct
- Ensure Python dependencies are installed: `pip install -r requirements.txt`
- Check for port conflicts (8000)

### Frontend won't start

- Ensure Node.js dependencies are installed: `npm install`
- Check for port conflicts (5173)
- Clear cache: `rm -rf node_modules && npm install`

### No albums after scanning

- Verify your music library path in `backend/.env`
- Check that your music files are `.flac` format
- Look at scan errors in the admin panel

### Collections not showing albums

- Ensure you've run the library scan first
- Check that `album_path` in `collections.json` matches your actual folder structure
- Run "Sync Collections" after editing `collections.json`

## Next Steps

- Explore the admin interface to manage your library
- Customize collections for different moods/themes
- Add more albums to your collections via `collections.json`
- Try different collection configurations

## Development Tools

- **Backend API Docs**: http://localhost:8000/docs
- **Backend Health Check**: http://localhost:8000/health
- **Frontend Dev Tools**: Open browser console for React Query DevTools

Enjoy your retro jukebox experience! 🎵
