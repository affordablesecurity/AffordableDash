"""add customers.is_archived

Revision ID: 20260209_add_customers_is_archived
Revises: PUT_PREVIOUS_REVISION_HERE
Create Date: 2026-02-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260209_add_customers_is_archived"
down_revision = "PUT_PREVIOUS_REVISION_HERE"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "customers",
        sa.Column(
            "is_archived",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.create_index(
        "ix_customers_location_archived",
        "customers",
        ["location_id", "is_archived"],
        unique=False,
    )

    op.alter_column("customers", "is_archived", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_customers_location_archived", table_name="customers")
    op.drop_column("customers", "is_archived")
