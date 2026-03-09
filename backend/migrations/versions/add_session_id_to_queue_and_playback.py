"""add session_id to queue and playback_state (per-device/session queues)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, Sequence[str], None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_has_column(conn, table: str, column: str) -> bool:
    result = conn.execute(sa.text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in result)


def upgrade() -> None:
    conn = op.get_bind()

    # Queue: add session_id if not present (existing rows get 'legacy')
    if not _table_has_column(conn, 'queue', 'session_id'):
        op.add_column('queue', sa.Column('session_id', sa.String(), nullable=False, server_default='legacy'))
    try:
        op.create_index(op.f('ix_queue_session_id'), 'queue', ['session_id'], unique=False)
    except Exception:
        pass  # index may already exist

    # PlaybackState: add session_id if not present
    if not _table_has_column(conn, 'playback_state', 'session_id'):
        op.add_column('playback_state', sa.Column('session_id', sa.String(), nullable=False, server_default='legacy'))

    # SQLite: add composite unique (collection_id, session_id) via batch recreate.
    # Recreated table keeps session_id column and ix_playback_state_session_id; we add non-unique collection_id index and the composite unique.
    with op.batch_alter_table('playback_state', recreate='always') as batch:
        batch.create_index('ix_playback_state_collection_id', ['collection_id'], unique=False)
        batch.create_unique_constraint('uq_playback_state_collection_session', ['collection_id', 'session_id'])


def downgrade() -> None:
    with op.batch_alter_table('playback_state', recreate='always') as batch:
        batch.drop_constraint('uq_playback_state_collection_session', type_='unique')
        batch.drop_index('ix_playback_state_session_id', if_exists=True)
        batch.drop_index('ix_playback_state_collection_id', if_exists=True)
        batch.create_index('ix_playback_state_collection_id', ['collection_id'], unique=True)
    op.drop_column('playback_state', 'session_id')

    op.drop_index(op.f('ix_queue_session_id'), table_name='queue')
    op.drop_column('queue', 'session_id')
