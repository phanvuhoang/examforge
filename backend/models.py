import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, Float, Integer, DateTime,
    ForeignKey, JSON, ARRAY, UniqueConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from database import Base


def gen_uuid():
    return uuid.uuid4()


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    plan = Column(String(50), default="free")
    settings_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="organization")
    projects = relationship("Project", back_populates="organization")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    password_hash = Column(String(500), nullable=True)
    role = Column(String(20), nullable=False, default="user")
    oauth_provider = Column(String(50), nullable=True)
    oauth_id = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")
    projects_created = relationship("Project", back_populates="creator")
    documents_uploaded = relationship("Document", back_populates="uploader")
    questions_created = relationship("Question", back_populates="creator")
    notifications = relationship("Notification", back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    ai_provider_override = Column(String(50), nullable=True)
    ai_model_override = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization", back_populates="projects")
    creator = relationship("User", back_populates="projects_created")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="project", cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="project", cascade="all, delete-orphan")
    exam_templates = relationship("ExamTemplate", back_populates="project", cascade="all, delete-orphan")
    exams = relationship("Exam", back_populates="project", cascade="all, delete-orphan")
    ai_generation_jobs = relationship("AIGenerationJob", back_populates="project")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    filename = Column(String(500), nullable=False)
    storage_key = Column(String(500), nullable=False)
    file_type = Column(String(20), nullable=True)
    status = Column(String(20), default="processing")
    chunk_count = Column(Integer, default=0)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="documents")
    uploader = relationship("User", back_populates="documents_uploaded")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=False)
    content_text = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    embedding = Column(Vector(1536), nullable=True)
    metadata_json = Column(JSON, default=dict)

    document = relationship("Document", back_populates="chunks")

    __table_args__ = (
        Index("ix_document_chunks_embedding", "embedding", postgresql_using="hnsw", postgresql_ops={"embedding": "vector_cosine_ops"}),
    )


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String(100), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("tags.id"), nullable=True)
    color = Column(String(20), nullable=True)

    project = relationship("Project", back_populates="tags")
    parent = relationship("Tag", remote_side="Tag.id", backref="children")


class QuestionTag(Base):
    __tablename__ = "question_tags"

    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    type = Column(String(20), nullable=False)
    body_html = Column(Text, nullable=False)
    body_plain = Column(Text, nullable=True)
    correct_answer_json = Column(JSON, nullable=True)
    explanation_html = Column(Text, nullable=True)
    points_default = Column(Float, default=1.0)
    difficulty = Column(String(10), default="medium")
    ai_generated = Column(Boolean, default=False)
    approved = Column(Boolean, default=False)
    quality_score = Column(String(20), nullable=True)
    is_pinned = Column(Boolean, default=False)
    shuffle_options = Column(Boolean, default=True)
    shuffle_right_col = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    source_doc_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    language = Column(String(10), default="vi")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="questions")
    creator = relationship("User", back_populates="questions_created")
    options = relationship("QuestionOption", back_populates="question", cascade="all, delete-orphan", order_by="QuestionOption.display_order")
    tags = relationship("Tag", secondary="question_tags", backref="questions")
    versions = relationship("QuestionVersion", back_populates="question", cascade="all, delete-orphan", order_by="QuestionVersion.version_num.desc()")


class QuestionOption(Base):
    __tablename__ = "question_options"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    body_html = Column(Text, nullable=False)
    is_correct = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)
    partial_credit_pct = Column(Float, default=0)
    pin = Column(Boolean, default=False)

    question = relationship("Question", back_populates="options")


class QuestionVersion(Base):
    __tablename__ = "question_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    version_num = Column(Integer, nullable=False)
    body_html = Column(Text, nullable=True)
    correct_answer_json = Column(JSON, nullable=True)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="versions")


class ExamTemplate(Base):
    __tablename__ = "exam_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    settings_json = Column(JSON, default=dict)
    total_points = Column(Float, default=10.0)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="exam_templates")
    sections = relationship("TemplateSection", back_populates="template", cascade="all, delete-orphan", order_by="TemplateSection.display_order")


class TemplateSection(Base):
    __tablename__ = "template_sections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    template_id = Column(UUID(as_uuid=True), ForeignKey("exam_templates.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=True)
    intro_html = Column(Text, nullable=True)
    question_type_filter = Column(ARRAY(Text), nullable=True)
    tag_filter = Column(ARRAY(Text), nullable=True)
    difficulty_filter = Column(ARRAY(Text), nullable=True)
    question_count = Column(Integer, nullable=False, default=10)
    points_per_question = Column(Float, default=1.0)
    randomize = Column(Boolean, default=True)
    fixed_question_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=True)
    display_order = Column(Integer, default=0)

    template = relationship("ExamTemplate", back_populates="sections")


class Exam(Base):
    __tablename__ = "exams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("exam_templates.id"), nullable=True)
    title = Column(String(300), nullable=False)
    status = Column(String(20), default="draft")
    access_type = Column(String(20), default="public")
    passcode = Column(String(100), nullable=True)
    allowed_identifiers = Column(ARRAY(Text), nullable=True)
    open_at = Column(DateTime, nullable=True)
    close_at = Column(DateTime, nullable=True)
    settings_json = Column(JSON, default=dict)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    token = Column(String(100), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="exams")
    exam_questions = relationship("ExamQuestion", back_populates="exam", cascade="all, delete-orphan", order_by="ExamQuestion.display_order")
    question_pools = relationship("QuestionPool", back_populates="exam", cascade="all, delete-orphan")
    attempts = relationship("Attempt", back_populates="exam")


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    section_name = Column(String(200), nullable=True)
    display_order = Column(Integer, default=0)
    pool_id = Column(UUID(as_uuid=True), nullable=True)
    points_override = Column(Float, nullable=True)
    is_pinned = Column(Boolean, default=False)

    exam = relationship("Exam", back_populates="exam_questions")
    question = relationship("Question")


class QuestionPool(Base):
    __tablename__ = "question_pools"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=True)
    show_count = Column(Integer, nullable=False, default=1)
    display_order = Column(Integer, default=0)

    exam = relationship("Exam", back_populates="question_pools")


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    identifier_text = Column(String(200), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    score_raw = Column(Float, nullable=True)
    score_pct = Column(Float, nullable=True)
    passed = Column(Boolean, nullable=True)
    time_taken_sec = Column(Integer, nullable=True)
    ip_address = Column(String(50), nullable=True)

    exam = relationship("Exam", back_populates="attempts")
    responses = relationship("Response", back_populates="attempt", cascade="all, delete-orphan")


class Response(Base):
    __tablename__ = "responses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    attempt_id = Column(UUID(as_uuid=True), ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False)
    exam_question_id = Column(UUID(as_uuid=True), ForeignKey("exam_questions.id"), nullable=False)
    answer_data_json = Column(JSON, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    score_awarded = Column(Float, nullable=True)
    score_override = Column(Float, nullable=True)
    feedback_html = Column(Text, nullable=True)
    graded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    graded_at = Column(DateTime, nullable=True)

    attempt = relationship("Attempt", back_populates="responses")
    exam_question = relationship("ExamQuestion")


class AIGenerationJob(Base):
    __tablename__ = "ai_generation_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    status = Column(String(20), default="pending")
    provider = Column(String(50), nullable=True)
    model = Column(String(100), nullable=True)
    config_json = Column(JSON, default=dict)
    questions_generated = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    cost_usd = Column(Float, default=0)
    error_msg = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="ai_generation_jobs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    type = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)
    read_at = Column(DateTime, nullable=True)
    payload_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")
