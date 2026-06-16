"""add cancelled request status

Revision ID: 001_cancelled
"""
from alembic import op

revision = "001_cancelled"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE requeststatus ADD VALUE IF NOT EXISTS 'cancelled'")


def downgrade():
    pass  # PostgreSQL не поддерживает удаление значений enum
