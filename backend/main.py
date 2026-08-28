from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.database.connection import engine, get_db
from backend.database import models
from backend.websockets.manager import manager
from backend.websockets.chat import router as chat_router
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from fastapi.security import (
    OAuth2PasswordBearer,
    OAuth2PasswordRequestForm
)
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from datetime import datetime, timedelta, timezone
from jose import jwt
import os

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)

models.Base.metadata.create_all(bind=engine)

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="login"
)


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(password: str, hashed_password: str):
    return pwd_context.verify(
        password,
        hashed_password
    )


def create_access_token(user_id: int):

    expire = (
        datetime.now(timezone.utc)
        + timedelta(minutes=JWT_EXPIRE_MINUTES)
    )

    payload = {
        "user_id": user_id,
        "exp": expire
    }

    return jwt.encode(
        payload,
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM
    )

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM]
        )

        user_id = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )

    except Exception:

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    user = (
        db.query(models.User)
        .filter(models.User.id == user_id)
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user

@app.get("/")
def home():
    return {
        "message": "Private Chat Backend is running"
    }


@app.get("/db-test")
def db_test():

    try:

        with engine.connect():

            return {
                "status": "success",
                "message": "mysql connected successfully!"
            }

    except Exception as e:

        return {
            "status": "error",
            "message": str(e)
        }

@app.get("/users")
def get_users(
    db: Session = Depends(get_db)
):
    users = db.query(models.User).all()

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "created_at": user.created_at,
            "online": manager.is_online(user.id)
        }

        for user in users
    ]

@app.get("/users/{user_id}")
def get_user_by_id(
    user_id: int,
    db: Session = Depends(get_db)
):

    user = (
        db.query(models.User)
        .filter(models.User.id == user_id)
        .first()
    )

    if not user:

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
        "online": manager.is_online(user.id)
    }

@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db)
):

    user = (
        db.query(models.User)
        .filter(models.User.id == user_id)
        .first()
    )

    if not user:

        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    db.delete(user)
    db.commit()

    return {
        "message": "user deleted successfully"
    }

@app.post("/messages")
def create_message(
    sender_id: int,
    receiver_id: int,
    message: str,
    db: Session = Depends(get_db)
):

    new_message = models.Message(
        sender_id=sender_id,
        receiver_id=receiver_id,
        message=message
    )

    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    return {
        "message": "message sent successfully",
        "message_id": new_message.id,
        "sender_id": new_message.sender_id,
        "receiver": new_message.receiver_id,
        "text": new_message.message,
        "created_at": new_message.created_at
    }

@app.get("/messages")
def get_messages(
    db: Session = Depends(get_db)
):

    messages = db.query(models.Message).all()

    return messages

@app.get("/messages/{user1_id}/{user2_id}")
def get_chat(
    user1_id: int,
    user2_id: int,
    db: Session = Depends(get_db)
):

    messages = (
        db.query(models.Message)
        .filter(
            (
                (models.Message.sender_id == user1_id)
                &
                (models.Message.receiver_id == user2_id)
            )
            |
            (
                (models.Message.sender_id == user2_id)
                &
                (models.Message.receiver_id == user1_id)
            )
        )
        .order_by(models.Message.created_at)
        .all()
    )

    return messages

@app.post("/register")
def register(
    username: str,
    email: str,
    password: str,
    db: Session = Depends(get_db)
):

    existing_username = (
        db.query(models.User)
        .filter(models.User.username == username)
        .first()
    )

    if existing_username:

        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    existing_email = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if existing_email:

        raise HTTPException(
            status_code=400,
            detail="Email already exists"
        )

    hashed_password = hash_password(password)

    new_user = models.User(
        username=username,
        email=email,
        password=hashed_password
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "registration successful",
        "user_id": new_user.id,
        "username": new_user.username,
        "email": new_user.email
    }

@app.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    email = form_data.username
    password = form_data.password

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        password,
        user.password
    ):

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )
    access_token = create_access_token(
        user.id
    )
    return {
        "message": "login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "email": user.email
    }

@app.get("/me")
def get_my_profile(
    current_user=Depends(get_current_user)
):

    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email
    }