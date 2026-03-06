"""add source to collections

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, Sequence[str], None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'collections',
        sa.Column('source', sa.String(), nullable=False, server_default='local')
    )
    # All existing collections are local-library collections
    op.execute("UPDATE collections SET source = 'local'")


def downgrade() -> None:
    op.drop_column('collections', 'source')
