"""add spotify and tidal to album and track

Revision ID: b0c9d8e7f6a5
Revises: a9b8c7d6e5f4
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b0c9d8e7f6a5'
down_revision: Union[str, Sequence[str], None] = 'a9b8c7d6e5f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('albums', sa.Column('spotify_id', sa.String(), nullable=True))
    op.add_column('albums', sa.Column('spotify_url', sa.String(), nullable=True))
    op.add_column('albums', sa.Column('tidal_id', sa.String(), nullable=True))
    op.add_column('albums', sa.Column('tidal_url', sa.String(), nullable=True))
    op.create_index(op.f('ix_albums_spotify_id'), 'albums', ['spotify_id'], unique=False)

    op.add_column('tracks', sa.Column('spotify_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_tracks_spotify_id'), 'tracks', ['spotify_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_tracks_spotify_id'), table_name='tracks')
    op.drop_column('tracks', 'spotify_id')
    op.drop_index(op.f('ix_albums_spotify_id'), table_name='albums')
    op.drop_column('albums', 'tidal_url')
    op.drop_column('albums', 'tidal_id')
    op.drop_column('albums', 'spotify_url')
    op.drop_column('albums', 'spotify_id')
