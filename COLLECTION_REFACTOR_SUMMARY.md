# Collection System Refactor Summary

## What Changed

The collection management system has been refactored from a JSON config-file approach to a database-first approach with UI management.

## Key Changes

### 1. Removed JSON Config Dependency

**Before:**
- Collections defined in `collections/collections.json`
- Required manual file editing
- Needed "Sync Collections" button to load changes

**After:**
- Collections managed directly in database
- Create/edit/delete via Admin UI
- No config file sync needed

### 2. Added "All Albums" Collection

A special virtual collection that shows all albums in the database:
- Slug: `all`
- Special UUID: `00000000-0000-0000-0000-000000000000`
- Cannot be deleted or edited
- Automatically appears first in collection dropdown
- Shows all albums regardless of collection assignments

### 3. New Admin UI Features

**Collection Manager Tab:**
- ✅ Create new collections
- ✅ Delete collections (except "All")
- ✅ View all collections
- Auto-generates URL-safe slug from name
- Add descriptions to collections

### 4. Simplified Startup

**Before:**
```python
# Loaded collections from JSON on startup
collection_service.load_collections_from_config()
```

**After:**
```python
# Just ensures "all" collection exists
# Other collections managed through admin UI
```

### 5. Backend API Changes

**New Endpoints:**
```
POST   /api/admin/collections              # Create collection
PUT    /api/admin/collections/{id}         # Update collection
DELETE /api/admin/collections/{id}         # Delete collection
```

**Removed Endpoints:**
```
POST /api/admin/collections/sync  # No longer needed
```

**Modified Endpoints:**
- All queue/playback endpoints now handle "all" collection
- Album endpoints filter by collection (or show all for "all" collection)

## Database Structure

No changes to database schema! The existing tables already supported this:
- `collections` table stores all collections (including "all")
- `collection_albums` junction table for many-to-many relationships
- Albums can belong to multiple collections

## Usage

### Creating a Collection

1. Go to Admin Mode
2. Click "Collection Manager" tab
3. Click "+ Create Collection"
4. Enter name (e.g., "Dad Rock Jukebox")
5. Slug auto-generated (e.g., "dad-rock")
6. Add optional description
7. Click "Create Collection"

### Using Collections

1. Collection appears in dropdown automatically
2. "All Albums" always appears first
3. Select collection to browse its albums
4. Albums maintain their assigned collections

### Adding Albums to Collections

Currently requires API or database access. Future enhancement will add UI for:
- Drag-and-drop album assignment
- Bulk operations
- Track selection per collection

## Migration Notes

### If You Had JSON Collections

Your old `collections.json` file is no longer used. To migrate:

1. Start the application (creates "All Albums" collection)
2. Use Admin UI to create your collections
3. Use API or database to assign albums to collections

Example API call to add album to collection:
```bash
curl -X PUT "http://localhost:8000/api/admin/collections/dive-bar/albums?album_id=ALBUM_ID&action=add&sort_order=1"
```

### Database Migration

No migration needed! The schema supports this already. Just restart your backend.

## Benefits

✅ **Easier Management**: Create collections via UI, no file editing
✅ **More Flexible**: "All Albums" view for browsing entire library
✅ **Simpler Code**: Removed config sync logic
✅ **Better UX**: No need to sync after changes
✅ **Future-Ready**: Foundation for drag-and-drop album management

## What Stays the Same

- Albums can still belong to multiple collections
- Display numbers (001-999) still calculated from sort_order
- Track selection per collection still works
- Queue and playback work identically
- Database schema unchanged

## Next Steps

Future enhancements for collection management:
1. UI for adding albums to collections
2. Drag-and-drop album assignment
3. Track selection UI (enable/disable per collection)
4. Bulk operations
5. Collection templates

## Testing

After updating, test:
- [x] "All Albums" appears in dropdown
- [x] Create new collection in Admin UI
- [x] Delete collection
- [x] Browse albums in "All Albums"
- [x] Queue and playback work with all collections
- [x] Cannot delete "All Albums" collection
