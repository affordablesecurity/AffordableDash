from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import verify_password, hash_password
from app.models.user import User


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_user(db: Session, email: str, password: str, full_name: str | None = None, is_superadmin: bool = False) -> User:
    user = User(
        email=email.lower().strip(),
        password_hash=hash_password(password),
        full_name=full_name,
        is_superadmin=is_superadmin,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
