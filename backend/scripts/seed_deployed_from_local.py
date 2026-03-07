#!/usr/bin/env python3
"""
Seed the deployed (Postgres) database with Spotify-only data from the local (SQLite) database.

Only copies:
  - Albums with file_path starting with "spotify/"
  - Their tracks
  - Collections that have at least one such album (only the collection_album links for Spotify albums)
  - Optionally: the local user's Spotify tokens into the deployed user so you stay connected

All copied data is assigned to the deployed user (by default the first user in the deployed DB,
e.g. the one created by ADMIN_SEED_EMAIL on first deploy).

Usage:
  cd backend
  export DEPLOYED_DATABASE_URL="postgresql://..."   # Render External Database URL
  python scripts/seed_deployed_from_local.py

  Or:
  python scripts/seed_deployed_from_local.py --local sqlite:///./jukebox.db --deployed "$DEPLOYED_DATABASE_URL"

Options:
  --local URL          Local DB (default: sqlite:///./jukebox.db)
  --deployed URL       Deployed DB (required, or set DEPLOYED_DATABASE_URL)
  --deployed-user-email EMAIL  Use this user in deployed DB as owner (default: first user)
  --copy-spotify-tokens        Copy local user's Spotify connection to deployed user
  --dry-run            Print what would be copied, don't write to deployed
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path

# Run from backend dir so app is importable
if __name__ == "__main__":
    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    os.chdir(backend_dir)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import text

from app.models import (
    User,
    Album,
    Track,
    Collection,
    CollectionAlbum,
    UserSpotifyConnection,
)


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed deployed DB with Spotify-only data from local DB")
    ap.add_argument("--local", default="sqlite:///./jukebox.db", help="Local DB URL")
    ap.add_argument("--deployed", default=os.environ.get("DEPLOYED_DATABASE_URL"), help="Deployed DB URL (or set DEPLOYED_DATABASE_URL)")
    ap.add_argument("--deployed-user-email", default=None, help="Email of user in deployed DB to own the data (default: first user)")
    ap.add_argument("--copy-spotify-tokens", action="store_true", help="Copy local user's Spotify tokens to deployed user")
    ap.add_argument("--dry-run", action="store_true", help="Only print what would be copied")
    args = ap.parse_args()

    if not args.deployed:
        print("Error: --deployed or DEPLOYED_DATABASE_URL is required.", file=sys.stderr)
        sys.exit(1)

    # Normalize Postgres URL if needed
    deployed_url = args.deployed
    if deployed_url.startswith("postgres://"):
        deployed_url = "postgresql://" + deployed_url.split("://", 1)[1]

    local_engine = create_engine(
        args.local,
        connect_args={"check_same_thread": False} if args.local.startswith("sqlite") else {},
    )
    deployed_engine = create_engine(deployed_url)

    LocalSession = sessionmaker(bind=local_engine, autocommit=False, autoflush=False)
    DeployedSession = sessionmaker(bind=deployed_engine, autocommit=False, autoflush=False)

    with LocalSession() as local_db, DeployedSession() as deployed_db:
        # 1. Get deployed user (owner of all seeded data)
        deployed_user = _get_deployed_user(deployed_db, args.deployed_user_email)
        if not deployed_user:
            print("Error: No user found in deployed DB. Deploy the app once with ADMIN_SEED_EMAIL so a user exists.", file=sys.stderr)
            sys.exit(1)
        print(f"Deployed user: {deployed_user.email} (id={deployed_user.id})")

        # 2. Spotify albums and their tracks from local
        spotify_albums = (
            local_db.query(Album)
            .filter(Album.file_path.startswith("spotify/"))
            .order_by(Album.id)
            .all()
        )
        if not spotify_albums:
            print("No Spotify albums found in local DB (file_path like 'spotify/%'). Nothing to seed.")
            return

        old_to_new_album: dict[str, str] = {}
        old_to_new_track: dict[str, str] = {}
        for a in spotify_albums:
            old_to_new_album[a.id] = str(uuid.uuid4())
            for t in a.tracks:
                old_to_new_track[t.id] = str(uuid.uuid4())

        # 3. Collections that have at least one Spotify album; only collection_album rows for those albums
        spotify_album_ids = {a.id for a in spotify_albums}
        # All collection_albums that point to a spotify album
        ca_rows = (
            local_db.query(CollectionAlbum)
            .filter(CollectionAlbum.album_id.in_(spotify_album_ids))
            .all()
        )
        collection_ids_to_copy = {ca.collection_id for ca in ca_rows}
        collections_to_copy = (
            local_db.query(Collection)
            .filter(Collection.id.in_(collection_ids_to_copy))
            .order_by(Collection.id)
            .all()
        )

        # Dedupe by slug: only one deployed collection per (user, slug, source). Reuse existing in deployed if present.
        existing_deployed = {
            c.slug: c.id
            for c in deployed_db.query(Collection).filter(
                Collection.user_id == deployed_user.id,
                Collection.source == "spotify",
            ).all()
        }
        slug_to_new_id: dict[str, str] = {}
        old_to_new_collection: dict[str, str] = {}
        for c in collections_to_copy:
            if c.slug in slug_to_new_id:
                old_to_new_collection[c.id] = slug_to_new_id[c.slug]
            elif c.slug in existing_deployed:
                existing_id = existing_deployed[c.slug]
                slug_to_new_id[c.slug] = existing_id
                old_to_new_collection[c.id] = existing_id
            else:
                new_id = str(uuid.uuid4())
                slug_to_new_id[c.slug] = new_id
                old_to_new_collection[c.id] = new_id

        # CollectionAlbum rows to copy (only for spotify albums)
        ca_to_copy = [ca for ca in ca_rows if ca.collection_id in old_to_new_collection]

        print(f"Spotify albums: {len(spotify_albums)}")
        print(f"Tracks: {sum(len(a.tracks) for a in spotify_albums)}")
        print(f"Collections: {len(collections_to_copy)}")
        print(f"Collection-album links: {len(ca_to_copy)}")

        if args.dry_run:
            print("Dry run: not writing to deployed DB.")
            return

        # 4. Insert into deployed DB
        deployed_user_id = deployed_user.id

        # Albums
        for a in spotify_albums:
            new_id = old_to_new_album[a.id]
            row = Album(
                id=new_id,
                user_id=deployed_user_id,
                file_path=a.file_path,
                title=a.title,
                artist=a.artist,
                cover_art_path=a.cover_art_path,
                custom_cover_art_path=a.custom_cover_art_path,
                total_tracks=a.total_tracks,
                year=a.year,
                has_multi_disc=a.has_multi_disc,
                various_artists=a.various_artists,
                archived=a.archived,
                description=a.description,
                is_playlist=a.is_playlist,
                spotify_id=a.spotify_id,
                spotify_url=a.spotify_url,
                spotify_image_url=a.spotify_image_url,
                tidal_id=a.tidal_id,
                tidal_url=a.tidal_url,
                extra_metadata=a.extra_metadata or {},
            )
            deployed_db.add(row)
        deployed_db.flush()

        # Tracks
        for a in spotify_albums:
            new_album_id = old_to_new_album[a.id]
            for t in sorted(a.tracks, key=lambda x: (x.disc_number, x.track_number)):
                new_id = old_to_new_track[t.id]
                row = Track(
                    id=new_id,
                    album_id=new_album_id,
                    file_path=t.file_path,
                    disc_number=t.disc_number,
                    track_number=t.track_number,
                    title=t.title,
                    artist=t.artist,
                    duration_ms=t.duration_ms or 0,
                    enabled=t.enabled,
                    archived=t.archived,
                    is_favorite=t.is_favorite,
                    is_recommended=t.is_recommended,
                    spotify_id=t.spotify_id,
                    extra_metadata=t.extra_metadata or {},
                )
                deployed_db.add(row)
        deployed_db.flush()

        # Collections (source='spotify'): only insert if not already in deployed (one per unique slug)
        seen_slugs: set[str] = set()
        for c in collections_to_copy:
            if c.slug in existing_deployed:
                seen_slugs.add(c.slug)
                continue
            if c.slug in seen_slugs:
                continue
            seen_slugs.add(c.slug)
            new_id = old_to_new_collection[c.id]
            row = Collection(
                id=new_id,
                user_id=deployed_user_id,
                name=c.name,
                slug=c.slug,
                description=c.description,
                published=c.published,
                source="spotify",
                config_file=c.config_file,
                is_active=c.is_active,
                sections_enabled=c.sections_enabled,
                sections=c.sections,
                default_sort_order=c.default_sort_order,
                default_show_jump_to_bar=c.default_show_jump_to_bar,
                default_jump_button_type=c.default_jump_button_type,
                default_show_color_coding=c.default_show_color_coding,
                default_show_card_background=c.default_show_card_background,
                default_edit_mode=c.default_edit_mode,
                default_crossfade_seconds=c.default_crossfade_seconds,
                default_hit_button_mode=c.default_hit_button_mode,
            )
            deployed_db.add(row)
        deployed_db.flush()

        # CollectionAlbums (only for spotify albums; re-map enabled_track_ids to new track IDs)
        # Dedupe by (collection_id, album_id) in case multiple local collections merged to one slug
        seen_ca: set[tuple[str, str]] = set()
        for ca in ca_to_copy:
            new_collection_id = old_to_new_collection[ca.collection_id]
            new_album_id = old_to_new_album[ca.album_id]
            key = (new_collection_id, new_album_id)
            if key in seen_ca:
                continue
            seen_ca.add(key)
            # Map enabled_track_ids (list of old track IDs) to new track IDs
            enabled = ca.enabled_track_ids or []
            new_enabled = [old_to_new_track[tid] for tid in enabled if tid in old_to_new_track]
            row = CollectionAlbum(
                id=str(uuid.uuid4()),
                collection_id=new_collection_id,
                album_id=new_album_id,
                display_number=ca.display_number,
                sort_order=ca.sort_order,
                enabled_track_ids=new_enabled,
            )
            deployed_db.add(row)
        deployed_db.flush()

        # Optional: copy Spotify connection from local user to deployed user
        if args.copy_spotify_tokens:
            local_users = local_db.query(User).all()
            if not local_users:
                print("No local user found; skipping --copy-spotify-tokens.")
            else:
                local_user = local_users[0]
                conn = local_db.query(UserSpotifyConnection).filter(UserSpotifyConnection.user_id == local_user.id).first()
                if not conn:
                    print("Local user has no Spotify connection; skipping --copy-spotify-tokens.")
                else:
                    existing = deployed_db.query(UserSpotifyConnection).filter(UserSpotifyConnection.user_id == deployed_user_id).first()
                    if existing:
                        existing.access_token = conn.access_token
                        existing.refresh_token = conn.refresh_token
                        existing.expires_at = conn.expires_at
                        print("Updated deployed user's Spotify connection from local.")
                    else:
                        deployed_db.add(UserSpotifyConnection(
                            id=str(uuid.uuid4()),
                            user_id=deployed_user_id,
                            access_token=conn.access_token,
                            refresh_token=conn.refresh_token,
                            expires_at=conn.expires_at,
                        ))
                        print("Copied local user's Spotify connection to deployed user.")

        deployed_db.commit()
    print("Done. Deployed DB seeded with Spotify-only data.")


def _get_deployed_user(db: Session, email: str | None) -> User | None:
    if email:
        return db.query(User).filter(User.email == email).first()
    return db.query(User).order_by(User.created_at).first()


if __name__ == "__main__":
    main()
