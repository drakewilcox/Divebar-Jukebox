"""add_settings_table

Revision ID: d4e8f1a2b3c4
Revises: cb088dc7ca1c
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e8f1a2b3c4'
down_revision: Union[str, Sequence[str], None] = 'cb088dc7ca1c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'settings' not in insp.get_table_names():
        op.create_table(
            'settings',
            sa.Column('key', sa.String(), nullable=False),
            sa.Column('value', sa.String(), nullable=False, server_default=''),
            sa.PrimaryKeyConstraint('key'),
        )


def downgrade() -> None:
    op.drop_table('settings')
