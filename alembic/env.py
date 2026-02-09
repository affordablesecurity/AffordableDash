# alembic/env.py
from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ---------------------------------------------------------
# IMPORTANT: ensure project root is on sys.path
# This fixes: ModuleNotFoundError: No module named 'app'
# ---------------------------------------------------------
PROJECT_ROOT = os.path.abspath(os.getcwd())
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Alembic Config object (reads alembic.ini)
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Now imports work
from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402

# ---------------------------------------------------------
# Make sure ALL models are imported so metadata is complete
# (even if you don't autogenerate today, this prevents surprises)
# ---------------------------------------------------------
from app.models.user import User  # noqa: F401,E402
from app.models.location import Location, UserLocation  # noqa: F401,E402
from app.models.customer import Customer  # noqa: F401,E402
from app.models.organization import Organization  # noqa: F401,E402

target_metadata = Base.metadata


def get_url() -> str:
    # Prefer Render DATABASE_URL but fall back to settings.database_url
    return os.getenv("DATABASE_URL") or settings.database_url


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
