"""add_archived_and_custom_cover_to_albums

Revision ID: e5632098b898
Revises: e07aa1874951
Create Date: 2026-02-14 18:32:52.059004

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5632098b898'
down_revision: Union[str, Sequence[str], None] = 'e07aa1874951'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add archived column to albums table (with default False)
    op.add_column('albums', sa.Column('archived', sa.Boolean(), nullable=False, server_default='0'))
    
    # Add custom_cover_art_path column to albums table
    op.add_column('albums', sa.Column('custom_cover_art_path', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('albums', 'custom_cover_art_path')
    op.drop_column('albums', 'archived')
