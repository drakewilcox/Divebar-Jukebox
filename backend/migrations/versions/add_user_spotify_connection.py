"""add user_spotify_connections table for admin Spotify OAuth

Revision ID: e3f2g1h0i9j8
Revises: d2e1f0a9b8c7
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e3f2g1h0i9j8'
down_revision: Union[str, Sequence[str], None] = 'd2e1f0a9b8c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_spotify_connections',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('access_token', sa.String(), nullable=False),
        sa.Column('refresh_token', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_user_spotify_connections_user_id'), 'user_spotify_connections', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_user_spotify_connections_user_id'), table_name='user_spotify_connections')
    op.drop_table('user_spotify_connections')
