"""add_album_description_and_is_playlist

Revision ID: a9b8c7d6e5f4
Revises: f7e6d5c4b3a2
Create Date: 2026-02-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9b8c7d6e5f4'
down_revision: Union[str, Sequence[str], None] = 'f7e6d5c4b3a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('albums', sa.Column('description', sa.String(), nullable=True))
    op.add_column('albums', sa.Column('is_playlist', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('albums', 'is_playlist')
    op.drop_column('albums', 'description')
