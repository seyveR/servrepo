from sqlalchemy import Column, Integer, String, Boolean, Float, Text, DateTime
from datetime import datetime
from .database import Base

class Audit(Base):
    __tablename__ = "audits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    image_uid = Column(String(64), nullable=False, index=True)

    employee_id = Column(String(64), index=True, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    total_detections = Column(Integer, nullable=False, default=0)
    all_tools_present = Column(Boolean, nullable=False, default=False)
    min_confidence = Column(Float, nullable=False, default=0.0)
    manual_check_required = Column(Boolean, nullable=False, default=True)

    missing_tools = Column(Text, nullable=False, default="[]")
    extras_or_duplicates = Column(Text, nullable=False, default="[]")

    original_url = Column(String(255))
    processed_url = Column(String(255))
    report_url = Column(String(255))
