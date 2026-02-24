"""add_archived_to_tracks

Revision ID: a1b2c3d4e5f6
Revises: cb088dc7ca1c
Create Date: 2026-02-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd4e8f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tracks', sa.Column('archived', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('tracks', 'archived')
