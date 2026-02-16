"""add_favorite_and_recommended_to_tracks

Revision ID: cb088dc7ca1c
Revises: e5632098b898
Create Date: 2026-02-16 09:49:01.507474

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cb088dc7ca1c'
down_revision: Union[str, Sequence[str], None] = 'e5632098b898'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('tracks', sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('tracks', sa.Column('is_recommended', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tracks', 'is_recommended')
    op.drop_column('tracks', 'is_favorite')
