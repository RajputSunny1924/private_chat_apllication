from fastapi import WebSocket


class ConnectionManager:

    def __init__(self):
        self.active_connections = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()

        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()

        self.active_connections[user_id].add(websocket)

        print(f"User {user_id} connected")

    def disconnect(self, user_id: int, websocket: WebSocket):

        if user_id in self.active_connections:

            self.active_connections[user_id].discard(websocket)

            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

        print(f"User {user_id} disconnected")

    def is_online(self, user_id: int):

        return user_id in self.active_connections

    async def send_to_user(self, user_id: int, data: dict):

        if user_id not in self.active_connections:
            return

        disconnected = []

        for websocket in self.active_connections[user_id]:

            try:
                await websocket.send_json(data)

            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.active_connections[user_id].discard(websocket)

    async def broadcast(self, data: dict):

        disconnected = []

        for user_id, sockets in self.active_connections.items():

            for websocket in sockets:

                try:
                    await websocket.send_json(data)

                except Exception:
                    disconnected.append((user_id, websocket))

        for user_id, websocket in disconnected:

            self.active_connections[user_id].discard(websocket)

    def get_online_users(self):

        return list(self.active_connections.keys())


# IMPORTANT
# Ye line zaroor honi chahiye
manager = ConnectionManager()