from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from backend.database.connection import SessionLocal
from backend.database.models import Message


router = APIRouter()

# Connected users store honge
connected_users = {}


@router.websocket("/ws/{user_id}")
async def websocket_chat(websocket: WebSocket, user_id: int):

    await websocket.accept()

    connected_users[user_id] = websocket

    print(f"User {user_id} connected")

    try:
        while True:

            data = await websocket.receive_json()

            receiver_id = data["receiver_id"]
            message_text = data["message"]

            # Database connection
            db: Session = SessionLocal()

            try:
                # Message database mein save
                new_message = Message(
                    sender_id=user_id,
                    receiver_id=receiver_id,
                    message=message_text
                )

                db.add(new_message)
                db.commit()
                db.refresh(new_message)

            finally:
                db.close()

            # Receiver online hai?
            if receiver_id in connected_users:

                receiver_socket = connected_users[receiver_id]

                await receiver_socket.send_json({
                    "sender_id": user_id,
                    "receiver_id": receiver_id,
                    "message": message_text
                })

            # Sender ko confirmation
            await websocket.send_json({
                "status": "sent",
                "receiver_id": receiver_id,
                "message": message_text
            })

    except WebSocketDisconnect:

        connected_users.pop(user_id, None)

        print(f"User {user_id} disconnected")