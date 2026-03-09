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
    """Check whether a column already exists (works on both SQLite and Postgres)."""
    dialect = conn.dialect.name
    if dialect == 'sqlite':
        rows = conn.execute(sa.text(f"PRAGMA table_info({table})"))
        return any(row[1] == column for row in rows)
    # Postgres / other
    rows = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :table AND column_name = :col"
    ), {"table": table, "col": column})
    return rows.first() is not None


def _is_sqlite(conn) -> bool:
    return conn.dialect.name == 'sqlite'


def upgrade() -> None:
    conn = op.get_bind()

    # ── Queue: add session_id ──────────────────────────────────────────────
    if not _table_has_column(conn, 'queue', 'session_id'):
        op.add_column('queue', sa.Column('session_id', sa.String(), nullable=False, server_default='legacy'))
    try:
        op.create_index(op.f('ix_queue_session_id'), 'queue', ['session_id'], unique=False)
    except Exception:
        pass  # index may already exist

    # ── PlaybackState: add session_id ──────────────────────────────────────
    if not _table_has_column(conn, 'playback_state', 'session_id'):
        op.add_column('playback_state', sa.Column('session_id', sa.String(), nullable=False, server_default='legacy'))
    try:
        op.create_index(op.f('ix_playback_state_session_id'), 'playback_state', ['session_id'], unique=False)
    except Exception:
        pass

    # ── PlaybackState: change unique from (collection_id) → (collection_id, session_id) ──
    if _is_sqlite(conn):
        # SQLite needs batch recreate to alter constraints
        with op.batch_alter_table('playback_state', recreate='always') as batch:
            batch.create_index('ix_playback_state_collection_id', ['collection_id'], unique=False)
            batch.create_unique_constraint('uq_playback_state_collection_session', ['collection_id', 'session_id'])
    else:
        # Postgres: drop old unique index, add new composite unique constraint
        try:
            op.drop_index('ix_playback_state_collection_id', table_name='playback_state')
        except Exception:
            pass
        try:
            op.create_index('ix_playback_state_collection_id', 'playback_state', ['collection_id'], unique=False)
        except Exception:
            pass
        try:
            op.create_unique_constraint('uq_playback_state_collection_session', 'playback_state', ['collection_id', 'session_id'])
        except Exception:
            pass


def downgrade() -> None:
    conn = op.get_bind()

    if _is_sqlite(conn):
        with op.batch_alter_table('playback_state', recreate='always') as batch:
            batch.drop_constraint('uq_playback_state_collection_session', type_='unique')
            batch.create_index('ix_playback_state_collection_id', ['collection_id'], unique=True)
    else:
        op.drop_constraint('uq_playback_state_collection_session', 'playback_state', type_='unique')
        try:
            op.drop_index('ix_playback_state_collection_id', table_name='playback_state')
        except Exception:
            pass
        op.create_index('ix_playback_state_collection_id', 'playback_state', ['collection_id'], unique=True)

    try:
        op.drop_index(op.f('ix_playback_state_session_id'), table_name='playback_state')
    except Exception:
        pass
    op.drop_column('playback_state', 'session_id')

    try:
        op.drop_index(op.f('ix_queue_session_id'), table_name='queue')
    except Exception:
        pass
    op.drop_column('queue', 'session_id')
