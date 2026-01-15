from __future__ import annotations

import os
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.services.auth_service import get_user_by_email, create_user


def main():
    email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    password = os.getenv("ADMIN_PASSWORD", "ChangeMe123!")
    full_name = os.getenv("ADMIN_NAME", "Admin")

    db: Session = SessionLocal()
    try:
        existing = get_user_by_email(db, email)
        if existing:
            print("Admin already exists:", email)
            return
        user = create_user(db, email=email, password=password, full_name=full_name, is_superadmin=True)
        print("Created admin:", user.email)
        print("Password:", password)
    finally:
        db.close()

if __name__ == "__main__":
    main()
