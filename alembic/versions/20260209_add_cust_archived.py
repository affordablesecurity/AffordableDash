"""add customers.is_archived

Revision ID: 20260209_add_customers_is_archived
Revises: 0001_init
Create Date: 2026-02-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "20260209_add_cust_archived"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    tables = set(inspector.get_table_names())

    # If customers table doesn't exist (fresh DB), create it to match your ORM expectations.
    if "customers" not in tables:
        op.create_table(
            "customers",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), nullable=False, index=True),
            sa.Column("location_id", sa.Integer(), nullable=False, index=True),

            sa.Column("first_name", sa.String(length=120), nullable=False),
            sa.Column("last_name", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("phone", sa.String(length=50), nullable=True),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),

            sa.Column("address1", sa.String(length=255), nullable=True),
            sa.Column("address2", sa.String(length=255), nullable=True),
            sa.Column("city", sa.String(length=120), nullable=True),
            sa.Column("state", sa.String(length=50), nullable=True),
            sa.Column("zip", sa.String(length=20), nullable=True),

            sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),

            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_customers_location_id", "customers", ["location_id"])
        op.create_index("ix_customers_org_id", "customers", ["organization_id"])
        op.create_index("ix_customers_is_archived", "customers", ["is_archived"])
        return

    # Otherwise: table exists → add missing column if needed
    cols = {c["name"] for c in inspector.get_columns("customers")}
    if "is_archived" not in cols:
        op.add_column(
            "customers",
            sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
        op.create_index("ix_customers_is_archived", "customers", ["is_archived"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())
    if "customers" not in tables:
        return

    cols = {c["name"] for c in inspector.get_columns("customers")}
    if "is_archived" in cols:
        try:
            op.drop_index("ix_customers_is_archived", table_name="customers")
        except Exception:
            pass
        op.drop_column("customers", "is_archived")

