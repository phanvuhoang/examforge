"""Initial schema with all tables

Revision ID: 001
Revises:
Create Date: 2026-04-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
    op.execute("CREATE EXTENSION IF NOT EXISTS \"vector\"")

    op.create_table(
        "organizations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("plan", sa.String(50), server_default="free"),
        sa.Column("settings_json", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("email", sa.String(200), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(500), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("oauth_provider", sa.String(50), nullable=True),
        sa.Column("oauth_id", sa.String(200), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("ai_provider_override", sa.String(50), nullable=True),
        sa.Column("ai_model_override", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("file_type", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), server_default="processing"),
        sa.Column("chunk_count", sa.Integer, server_default="0"),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("content_text", sa.Text, nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("metadata_json", JSONB, server_default="{}"),
    )
    op.execute("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536)")
    # Note: ivfflat index requires rows to build. Use hnsw index instead for empty tables.
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops)")

    op.create_table(
        "tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("tags.id"), nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
    )

    op.create_table(
        "questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("body_html", sa.Text, nullable=False),
        sa.Column("body_plain", sa.Text, nullable=True),
        sa.Column("correct_answer_json", JSONB, nullable=True),
        sa.Column("explanation_html", sa.Text, nullable=True),
        sa.Column("points_default", sa.Float, server_default="1.0"),
        sa.Column("difficulty", sa.String(10), server_default="medium"),
        sa.Column("ai_generated", sa.Boolean, server_default=sa.text("false")),
        sa.Column("approved", sa.Boolean, server_default=sa.text("false")),
        sa.Column("quality_score", sa.String(20), nullable=True),
        sa.Column("is_pinned", sa.Boolean, server_default=sa.text("false")),
        sa.Column("shuffle_options", sa.Boolean, server_default=sa.text("true")),
        sa.Column("shuffle_right_col", sa.Boolean, server_default=sa.text("true")),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("source_doc_id", UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("language", sa.String(10), server_default="vi"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "question_options",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("question_id", UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("body_html", sa.Text, nullable=False),
        sa.Column("is_correct", sa.Boolean, server_default=sa.text("false")),
        sa.Column("display_order", sa.Integer, server_default="0"),
        sa.Column("partial_credit_pct", sa.Float, server_default="0"),
        sa.Column("pin", sa.Boolean, server_default=sa.text("false")),
    )

    op.create_table(
        "question_tags",
        sa.Column("question_id", UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", UUID(as_uuid=True), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "question_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("question_id", UUID(as_uuid=True), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_num", sa.Integer, nullable=False),
        sa.Column("body_html", sa.Text, nullable=True),
        sa.Column("correct_answer_json", JSONB, nullable=True),
        sa.Column("changed_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("changed_at", sa.DateTime, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "exam_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("settings_json", JSONB, server_default="{}"),
        sa.Column("total_points", sa.Float, server_default="10.0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "template_sections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("exam_templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("intro_html", sa.Text, nullable=True),
        sa.Column("question_type_filter", ARRAY(sa.Text), nullable=True),
        sa.Column("tag_filter", ARRAY(sa.Text), nullable=True),
        sa.Column("difficulty_filter", ARRAY(sa.Text), nullable=True),
        sa.Column("question_count", sa.Integer, nullable=False, server_default="10"),
        sa.Column("points_per_question", sa.Float, server_default="1.0"),
        sa.Column("randomize", sa.Boolean, server_default=sa.text("true")),
        sa.Column("fixed_question_ids", ARRAY(UUID(as_uuid=True)), nullable=True),
        sa.Column("display_order", sa.Integer, server_default="0"),
    )

    op.create_table(
        "exams",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("exam_templates.id"), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft"),
        sa.Column("access_type", sa.String(20), server_default="public"),
        sa.Column("passcode", sa.String(100), nullable=True),
        sa.Column("allowed_identifiers", ARRAY(sa.Text), nullable=True),
        sa.Column("open_at", sa.DateTime, nullable=True),
        sa.Column("close_at", sa.DateTime, nullable=True),
        sa.Column("settings_json", JSONB, server_default="{}"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("token", sa.String(100), unique=True, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "exam_questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("exam_id", UUID(as_uuid=True), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", UUID(as_uuid=True), sa.ForeignKey("questions.id"), nullable=False),
        sa.Column("section_name", sa.String(200), nullable=True),
        sa.Column("display_order", sa.Integer, server_default="0"),
        sa.Column("pool_id", UUID(as_uuid=True), nullable=True),
        sa.Column("points_override", sa.Float, nullable=True),
        sa.Column("is_pinned", sa.Boolean, server_default=sa.text("false")),
    )

    op.create_table(
        "question_pools",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("exam_id", UUID(as_uuid=True), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("show_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("display_order", sa.Integer, server_default="0"),
    )

    op.create_table(
        "attempts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("exam_id", UUID(as_uuid=True), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("identifier_text", sa.String(200), nullable=True),
        sa.Column("started_at", sa.DateTime, server_default=sa.text("NOW()")),
        sa.Column("submitted_at", sa.DateTime, nullable=True),
        sa.Column("score_raw", sa.Float, nullable=True),
        sa.Column("score_pct", sa.Float, nullable=True),
        sa.Column("passed", sa.Boolean, nullable=True),
        sa.Column("time_taken_sec", sa.Integer, nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
    )

    op.create_table(
        "responses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("attempt_id", UUID(as_uuid=True), sa.ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exam_question_id", UUID(as_uuid=True), sa.ForeignKey("exam_questions.id"), nullable=False),
        sa.Column("answer_data_json", JSONB, nullable=True),
        sa.Column("is_correct", sa.Boolean, nullable=True),
        sa.Column("score_awarded", sa.Float, nullable=True),
        sa.Column("score_override", sa.Float, nullable=True),
        sa.Column("feedback_html", sa.Text, nullable=True),
        sa.Column("graded_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("graded_at", sa.DateTime, nullable=True),
    )

    op.create_table(
        "ai_generation_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("config_json", JSONB, server_default="{}"),
        sa.Column("questions_generated", sa.Integer, server_default="0"),
        sa.Column("tokens_used", sa.Integer, server_default="0"),
        sa.Column("cost_usd", sa.Float, server_default="0"),
        sa.Column("error_msg", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
        sa.Column("completed_at", sa.DateTime, nullable=True),
    )

    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("type", sa.String(50), nullable=True),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("read_at", sa.DateTime, nullable=True),
        sa.Column("payload_json", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("NOW()")),
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("ai_generation_jobs")
    op.drop_table("responses")
    op.drop_table("attempts")
    op.drop_table("question_pools")
    op.drop_table("exam_questions")
    op.drop_table("exams")
    op.drop_table("template_sections")
    op.drop_table("exam_templates")
    op.drop_table("question_versions")
    op.drop_table("question_tags")
    op.drop_table("question_options")
    op.drop_table("questions")
    op.drop_table("tags")
    op.drop_table("document_chunks")
    op.drop_table("documents")
    op.drop_table("projects")
    op.drop_table("users")
    op.drop_table("organizations")
