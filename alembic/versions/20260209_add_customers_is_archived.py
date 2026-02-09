"""add customers.is_archived

Revision ID: 20260209_add_customers_is_archived
Revises: 0001_init
Create Date: 2026-02-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260209_add_customers_is_archived"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add column with a default so existing rows won’t break.
    op.add_column(
        "customers",
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Optional: remove server_default after backfilling so future inserts must set it explicitly
    # (Leaving it is fine too. This keeps behavior consistent.)
    op.alter_column("customers", "is_archived", server_default=None)


def downgrade() -> None:
    op.drop_column("customers", "is_archived")
