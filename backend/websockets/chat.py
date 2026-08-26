from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from backend.database.connection import SessionLocal
from backend.database.models import Message
from backend.websockets.manager import manager

router = APIRouter()


@router.websocket("/ws/{user_id}")
async def websocket_chat(websocket: WebSocket, user_id: int):
    await manager.connect(user_id, websocket)

    await manager.broadcast({
        "type": "presence",
        "user_id": user_id,
        "online": True
    })

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "seen":
                message_ids = data.get("message_ids", [])
                db: Session = SessionLocal()
                seen_messages = []

                try:
                    for message_id in message_ids:
                        msg = db.query(Message).filter(
                            Message.id == message_id,
                            Message.receiver_id == user_id
                        ).first()

                        if msg and msg.status != "seen":
                            msg.status = "seen"
                            seen_messages.append((msg.id, msg.sender_id))

                    db.commit()
                finally:
                    db.close()

                for message_id, sender_id in seen_messages:
                    await manager.send_to_user(
                        sender_id,
                        {
                            "type": "status",
                            "status": "seen",
                            "message_id": message_id
                        }
                    )

                continue

            receiver_id = data["receiver_id"]
            message_text = data["message"]

            db: Session = SessionLocal()

            try:
                new_message = Message(
                    sender_id=user_id,
                    receiver_id=receiver_id,
                    message=message_text,
                    status="sent"
                )

                db.add(new_message)
                db.commit()
                db.refresh(new_message)

                message_id = new_message.id
            finally:
                db.close()

            await websocket.send_json({
                "type": "status",
                "status": "sent",
                "message_id": message_id
            })

            if manager.is_online(receiver_id):
                db: Session = SessionLocal()

                try:
                    msg = db.query(Message).filter(
                        Message.id == message_id
                    ).first()

                    if msg:
                        msg.status = "delivered"
                        db.commit()
                finally:
                    db.close()

                await manager.send_to_user(
                    receiver_id,
                    {
                        "type": "message",
                        "message_id": message_id,
                        "sender_id": user_id,
                        "receiver_id": receiver_id,
                        "message": message_text,
                        "status": "delivered"
                    }
                )

                await websocket.send_json({
                    "type": "status",
                    "status": "delivered",
                    "message_id": message_id
                })

    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)

        await manager.broadcast({
            "type": "presence",
            "user_id": user_id,
            "online": False
        })