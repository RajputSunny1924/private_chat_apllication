from sqlalchemy import Column, Integer, String, DateTime, ForeignKey,Boolean
from sqlalchemy.sql import func
from backend.database.connection import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_otp = Column(String(6), nullable=True)
    otp_expiry = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())



class Message(Base):   
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, nullable=False)
    receiver_id = Column(Integer, nullable=False)
    message = Column(String(1000), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    status = Column(String(20))