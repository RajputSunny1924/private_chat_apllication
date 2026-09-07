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

            # =========================
            # VIEW ONCE MEDIA VIEWED
            # =========================
            
            if data.get("type") == "viewed":
            
                message_id = data.get("message_id")
            
                db: Session = SessionLocal()
            
                try:
                    msg = (
                        db.query(Message)
                        .filter(
                            Message.id == message_id,
                            Message.receiver_id == user_id,
                            Message.message_type == "media",
                            Message.is_view_once == True
                        )
                        .first()
                    )
            
                    if msg:
                        msg.status = "viewed"
                        db.commit()
            
                        sender_id = msg.sender_id
            
                    else:
                        sender_id = None
            
                finally:
                    db.close()
            
                if sender_id:
                    await manager.send_to_user(
                        sender_id,
                        {
                            "type": "status",
                            "status": "viewed",
                            "message_id": message_id
                        }
                    )
            
                continue
            # =========================
            # SEEN MESSAGE
            # =========================

            if data.get("type") == "seen":

                message_ids = data.get("message_ids", [])

                db: Session = SessionLocal()
                seen_messages = []

                try:

                    for message_id in message_ids:

                        msg = (
                            db.query(Message)
                            .filter(
                                Message.id == message_id,
                                Message.receiver_id == user_id
                            )
                            .first()
                        )

                        if (
                            msg
                            and msg.status != "seen"
                            and not (
                                msg.message_type == "media"
                                and msg.is_view_once
                            )
                        ):
                            msg.status = "seen"
                            seen_messages.append(
                                (msg.id, msg.sender_id)
                            )
                        
                            seen_messages.append(
                                (msg.id, msg.sender_id)
                            )

                    db.commit()

                finally:

                    db.close()

                # Notify sender about seen status
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

            # =========================
            # VIEW ONCE MEDIA
            # =========================
            
            if data.get("type") == "media":
            
                receiver_id = data["receiver_id"]
                media_type = data["media_type"]
                media_url = data["media_url"]
            
                db: Session = SessionLocal()
            
                try:
            
                    new_message = Message(
                        sender_id=user_id,
                        receiver_id=receiver_id,
                        message=None,
                        status="sent",
                        message_type="media",
                        media_type=media_type,
                        media_url=media_url,
                        is_view_once=True
                    )
            
                    db.add(new_message)
                    db.commit()
                    db.refresh(new_message)
            
                    message_id = new_message.id
            
                finally:
                    db.close()
            
                # Tell sender
                await websocket.send_json({
                    "type": "status",
                    "status": "sent",
                    "message_id": message_id,
                    "message_type": "media",
                    "media_type": media_type,
                    "media_url": media_url,
                    "receiver_id": receiver_id
                })
            
                # Send to receiver
                if manager.is_online(receiver_id):
            
                    db: Session = SessionLocal()
            
                    try:
            
                        msg = (
                            db.query(Message)
                            .filter(Message.id == message_id)
                            .first()
                        )
            
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
                            "message_type": "media",
                            "media_type": media_type,
                            "media_url": media_url,
                            "status": "delivered",
                            "is_view_once": True
                        }
                    )
            
                    await websocket.send_json({
                        "type": "status",
                        "status": "delivered",
                        "message_id": message_id
                    })
            
                continue
            

            # =========================
            # NORMAL MESSAGE
            # =========================

            
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

            # =========================
            # SENT STATUS
            # =========================

            await websocket.send_json({
                "type": "status",
                "status": "sent",
                "message_id": message_id,
                "message": message_text,
                "receiver_id": receiver_id
            })

            print("SENDER:", user_id)
            print("RECEIVER:", receiver_id)
            print(
                "RECEIVER ONLINE:",
                manager.is_online(receiver_id)
            )

            # =========================
            # DELIVERED STATUS
            # =========================

            if manager.is_online(receiver_id):

                db: Session = SessionLocal()

                try:

                    msg = (
                        db.query(Message)
                        .filter(
                            Message.id == message_id
                        )
                        .first()
                    )

                    if msg:

                        msg.status = "delivered"
                        db.commit()

                finally:

                    db.close()

                print(
                    "SENDING MESSAGE TO USER:",
                    receiver_id
                )

                # Send message to receiver
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

                # Tell sender message was delivered
                await websocket.send_json({
                    "type": "status",
                    "status": "delivered",
                    "message_id": message_id
                })

    except WebSocketDisconnect:

        manager.disconnect(
            user_id,
            websocket
        )

        await manager.broadcast({
            "type": "presence",
            "user_id": user_id,
            "online": False
        })


        

