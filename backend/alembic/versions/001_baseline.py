"""baseline schema

Revision ID: 001_baseline
Revises:
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "001_baseline"
down_revision = "001_cancelled"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    from app.core.db import Base
    import app.models.models  # noqa: F401

    insp = inspect(bind)
    if not insp.has_table("users"):
        Base.metadata.create_all(bind)
    cols = [c["name"] for c in insp.get_columns("users")] if insp.has_table("users") else []
    if "token_version" not in cols:
        op.add_column("users", sa.Column("token_version", sa.Integer(), server_default="0", nullable=False))


def downgrade():
    op.drop_column("users", "token_version")
