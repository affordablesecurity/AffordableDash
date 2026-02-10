"""
add customer_uid + contacts + addresses

Revision ID: 20260210_cust_contacts
Revises: 20260209_add_customers_is_archived
Create Date: 2026-02-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text, inspect


# Alembic identifiers
revision = "20260210_cust_contacts"
down_revision = "20260209_add_customers_is_archived"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # --- 1) Make alembic_version long enough (fix your earlier issue permanently) ---
    # Safe to run repeatedly.
    try:
        op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255);")
    except Exception:
        pass

    tables = set(inspector.get_table_names())

    # --- 2) Add customer_uid column on customers (if missing) ---
    if "customers" in tables:
        cols = {c["name"] for c in inspector.get_columns("customers")}
        if "customer_uid" not in cols:
            op.add_column("customers", sa.Column("customer_uid", sa.String(length=20), nullable=True))
            op.create_index("ix_customers_customer_uid", "customers", ["customer_uid"])

    # --- 3) Create customer_counters table (per-org UID sequence) ---
    if "customer_counters" not in tables:
        op.create_table(
            "customer_counters",
            sa.Column("organization_id", sa.Integer(), primary_key=True),
            sa.Column("next_num", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    # --- 4) customer_contacts table ---
    if "customer_contacts" not in tables:
        op.create_table(
            "customer_contacts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("type", sa.String(length=10), nullable=False),  # phone | email
            sa.Column("value", sa.String(length=255), nullable=False),
            sa.Column("label", sa.String(length=50), nullable=False, server_default=""),
            sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("can_call", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("can_text", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("can_email", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_customer_contacts_customer_id", "customer_contacts", ["customer_id"])
        op.create_index("ix_customer_contacts_primary", "customer_contacts", ["customer_id", "is_primary"])

    # --- 5) customer_addresses table ---
    if "customer_addresses" not in tables:
        op.create_table(
            "customer_addresses",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("label", sa.String(length=50), nullable=False, server_default=""),
            sa.Column("address1", sa.String(length=255), nullable=True),
            sa.Column("address2", sa.String(length=255), nullable=True),
            sa.Column("city", sa.String(length=120), nullable=True),
            sa.Column("state", sa.String(length=50), nullable=True),
            sa.Column("zip", sa.String(length=20), nullable=True),
            sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )
        op.create_index("ix_customer_addresses_customer_id", "customer_addresses", ["customer_id"])
        op.create_index("ix_customer_addresses_primary", "customer_addresses", ["customer_id", "is_primary"])

    # --- 6) Backfill: create counters per org, assign customer_uid to existing customers ---
    # We’ll do: for each organization_id, order customers by id and set CUS-000001 etc.
    if "customers" in tables:
        org_rows = bind.execute(text("SELECT DISTINCT organization_id FROM customers ORDER BY organization_id")).fetchall()
        for (org_id,) in org_rows:
            # ensure counter row exists
            bind.execute(
                text("""
                    INSERT INTO customer_counters (organization_id, next_num)
                    VALUES (:org_id, 1)
                    ON CONFLICT (organization_id) DO NOTHING
                """),
                {"org_id": org_id},
            )

            # fetch customers without uid
            cust_rows = bind.execute(
                text("""
                    SELECT id
                    FROM customers
                    WHERE organization_id = :org_id
                      AND (customer_uid IS NULL OR customer_uid = '')
                    ORDER BY id ASC
                """),
                {"org_id": org_id},
            ).fetchall()

            # get current next_num
            next_num = bind.execute(
                text("SELECT next_num FROM customer_counters WHERE organization_id = :org_id"),
                {"org_id": org_id},
            ).scalar_one()

            for (cust_id,) in cust_rows:
                uid = f"CUS-{next_num:06d}"
                bind.execute(
                    text("UPDATE customers SET customer_uid = :uid WHERE id = :id"),
                    {"uid": uid, "id": cust_id},
                )
                next_num += 1

            # update counter
            bind.execute(
                text("UPDATE customer_counters SET next_num = :n, updated_at = now() WHERE organization_id = :org_id"),
                {"n": next_num, "org_id": org_id},
            )

        # Make customer_uid NOT NULL once populated
        try:
            op.alter_column("customers", "customer_uid", existing_type=sa.String(length=20), nullable=False)
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = set(inspector.get_table_names())

    if "customer_addresses" in tables:
        op.drop_index("ix_customer_addresses_primary", table_name="customer_addresses")
        op.drop_index("ix_customer_addresses_customer_id", table_name="customer_addresses")
        op.drop_table("customer_addresses")

    if "customer_contacts" in tables:
        op.drop_index("ix_customer_contacts_primary", table_name="customer_contacts")
        op.drop_index("ix_customer_contacts_customer_id", table_name="customer_contacts")
        op.drop_table("customer_contacts")

    if "customer_counters" in tables:
        op.drop_table("customer_counters")

    if "customers" in tables:
        cols = {c["name"] for c in inspector.get_columns("customers")}
        if "customer_uid" in cols:
            op.drop_index("ix_customers_customer_uid", table_name="customers")
            op.drop_column("customers", "customer_uid")
