"""
Compatibility shim:
Some modules do: from app.db import models
But the real SQLAlchemy models live in app.models
"""

from app import models as _models  # app/models/__init__.py should re-export your model classes

# Re-export everything so callers can use `models.User`, etc.
__all__ = getattr(_models, "__all__", [])

for name in dir(_models):
    if name.startswith("_"):
        continue
    globals()[name] = getattr(_models, name)
