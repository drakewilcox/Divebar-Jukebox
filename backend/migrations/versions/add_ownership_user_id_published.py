"""add ownership: user_id and published

Revision ID: d2e1f0a9b8c7
Revises: c1d0e9f8a7b6
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd2e1f0a9b8c7'
down_revision: Union[str, Sequence[str], None] = 'c1d0e9f8a7b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_USER_ID = '00000000-0000-0000-0000-000000000001'


def _column_exists(conn, table: str, column: str) -> bool:
    r = conn.execute(sa.text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in r.fetchall())


def upgrade() -> None:
    conn = op.get_bind()
    # Add columns if not present (SQLite does not support ADD FOREIGN KEY via ALTER; model has FK for ORM)
    if not _column_exists(conn, 'albums', 'user_id'):
        op.add_column('albums', sa.Column('user_id', sa.String(), nullable=True))
    if not _column_exists(conn, 'collections', 'user_id'):
        op.add_column('collections', sa.Column('user_id', sa.String(), nullable=True))
    if not _column_exists(conn, 'collections', 'published'):
        op.add_column('collections', sa.Column('published', sa.Boolean(), nullable=False, server_default='0'))
    # Create indexes if not present
    try:
        op.create_index(op.f('ix_albums_user_id'), 'albums', ['user_id'], unique=False)
    except Exception:
        pass
    try:
        op.create_index(op.f('ix_collections_user_id'), 'collections', ['user_id'], unique=False)
    except Exception:
        pass

    # Ensure seed user exists and backfill (conn already set above)
    r = conn.execute(sa.text("SELECT COUNT(*) FROM users"))
    count = r.scalar()
    owner_id = SEED_USER_ID
    if count == 0:
        conn.execute(
            sa.text(
                "INSERT INTO users (id, slug, email, password_hash, created_at, updated_at) "
                "VALUES (:id, 'seed', 'seed@localhost', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"id": SEED_USER_ID},
        )
    else:
        r = conn.execute(sa.text("SELECT id FROM users LIMIT 1"))
        row = r.fetchone()
        if row:
            owner_id = row[0]

    conn.execute(sa.text("UPDATE collections SET user_id = :uid WHERE user_id IS NULL"), {"uid": owner_id})
    conn.execute(sa.text("UPDATE albums SET user_id = :uid WHERE user_id IS NULL"), {"uid": owner_id})

    # Drop old unique indexes on collections (SQLite)
    op.drop_index(op.f('ix_collections_name'), table_name='collections')
    op.drop_index(op.f('ix_collections_slug'), table_name='collections')
    op.create_index('ix_collections_name', 'collections', ['name'], unique=False)
    op.create_index('ix_collections_slug', 'collections', ['slug'], unique=False)
    op.create_index('uq_collection_user_slug', 'collections', ['user_id', 'slug'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_collection_user_slug', table_name='collections')
    op.drop_index(op.f('ix_collections_slug'), table_name='collections')
    op.drop_index(op.f('ix_collections_name'), table_name='collections')
    op.create_index(op.f('ix_collections_slug'), 'collections', ['slug'], unique=True)
    op.create_index(op.f('ix_collections_name'), 'collections', ['name'], unique=True)
    op.drop_index(op.f('ix_collections_user_id'), table_name='collections')
    op.drop_index(op.f('ix_albums_user_id'), table_name='albums')
    op.drop_column('collections', 'published')
    op.drop_column('collections', 'user_id')
    op.drop_column('albums', 'user_id')
