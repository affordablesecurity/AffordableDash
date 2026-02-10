from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def next_customer_uid(db: Session, organization_id: int) -> str:
    """
    Generates a new customer_uid like CUS-000001, per-organization.
    Safe under concurrency via SELECT ... FOR UPDATE.
    """
    db.execute(
        text("""
            INSERT INTO customer_counters (organization_id, next_num)
            VALUES (:org_id, 1)
            ON CONFLICT (organization_id) DO NOTHING
        """),
        {"org_id": organization_id},
    )

    row = db.execute(
        text("""
            SELECT next_num
            FROM customer_counters
            WHERE organization_id = :org_id
            FOR UPDATE
        """),
        {"org_id": organization_id},
    ).one()

    next_num = int(row[0])
    uid = f"CUS-{next_num:06d}"

    db.execute(
        text("""
            UPDATE customer_counters
            SET next_num = :n, updated_at = now()
            WHERE organization_id = :org_id
        """),
        {"n": next_num + 1, "org_id": organization_id},
    )

    return uid
