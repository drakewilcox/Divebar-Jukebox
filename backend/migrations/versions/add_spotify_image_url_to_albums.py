"""add spotify_image_url to albums

Revision ID: c1d2e3f4a5b6
Revises: b0c9d8e7f6a5
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'e3f2g1h0i9j8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('albums', sa.Column('spotify_image_url', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('albums', 'spotify_image_url')
