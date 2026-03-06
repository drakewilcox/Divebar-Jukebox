"""update collection unique constraint to (user_id, slug, source)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite requires batch/recreate mode to alter constraints.
    # recreate='always' rebuilds the table from scratch using the model definition,
    # which drops the old (user_id, slug) unique constraint and applies the new one.
    with op.batch_alter_table('collections', recreate='always') as batch_op:
        batch_op.create_unique_constraint(
            'uq_collection_user_slug_source',
            ['user_id', 'slug', 'source']
        )
    # The old index may persist as a standalone CREATE UNIQUE INDEX even after table recreate.
    # Drop it explicitly so it no longer blocks duplicate slugs across different sources.
    op.execute('DROP INDEX IF EXISTS uq_collection_user_slug')


def downgrade() -> None:
    with op.batch_alter_table('collections', recreate='always') as batch_op:
        batch_op.drop_constraint('uq_collection_user_slug_source', type_='unique')
        batch_op.create_unique_constraint(
            'uq_collection_user_slug',
            ['user_id', 'slug']
        )
