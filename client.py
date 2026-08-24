import asyncio
import json
import websockets
from websockets.exceptions import ConnectionClosed

SERVER_URL = "ws://127.0.0.1:8000"

async def get_input(prompt):
    """
    input() ko separate thread me run karta hai,
    taaki asyncio event loop block na ho.
    """
    return await asyncio.to_thread(input, prompt)

async def receive_messages(websocket):
    """
    Server se aane wale messages continuously receive karega.
    """
    try:
        while True:
            response = await websocket.recv()

            data = json.loads(response)
            if (
                "sender_id" in data
                and "receiver_id" in data
                and "message" in data
            ):

                sender_id = data["sender_id"]
                message = data["message"]

                print(f"\n📩 User {sender_id}: {message}")

                print(
                    "Message: ",
                    end="",
                    flush=True
                )
            elif data.get("status") == "error":
                print(
                    f"\n❌ {data.get('message', 'Unknown error')}"
                )

                print("Message: ",end="",flush=True)
            else:
                print(f"\nServer: {data}")

                print("Message: ",end="",flush=True)
    except ConnectionClosed:
        print("\n\n❌ Connection to server lost.")

async def main():

    while True:

        try:

            user_input = await get_input(
                "Enter your user ID: "
            )

            if not user_input.strip():
                print("User ID cannot be empty.")
                continue

            user_id = int(user_input)

            if user_id <= 0:
                print("User ID must be greater than 0.")
                continue

            break

        except ValueError:

            print(
                "Invalid user ID. "
                "Please enter a number."
            )
    uri = f"{SERVER_URL}/ws/{user_id}"

    try:

        async with websockets.connect(uri) as websocket:

            print(
                f"\nConnected as User {user_id}"
            )

            while True:

                receiver_input = await get_input(
                    "Chat with user ID: "
                )

                if receiver_input.strip().lower() == "/exit":
                    print("Closing chat...")
                    return

                if not receiver_input.strip():
                    print(
                        "Receiver ID cannot be empty."
                    )
                    continue

                try:

                    receiver_id = int(receiver_input)

                    if receiver_id <= 0:
                        print(
                            "Receiver ID must be greater than 0."
                        )
                        continue

                except ValueError:

                    print(
                        "Invalid receiver ID. "
                        "Please enter a number."
                    )
                    continue

                break


            print(
                f"\n💬 Chat opened with User {receiver_id}"
            )

            print(
                "Type /exit to close the chat.\n"
            )
            receive_task = asyncio.create_task(
                receive_messages(websocket)
            )

            try:
                while True:
                    message = await get_input("Message:")
                    if message.strip().lower() == "/exit":

                        print("\nClosing chat...")
                        break
                    if not message.strip():
                        print("Message cannot be empty.")
                        continue
                    try:
                        await websocket.send(
                            json.dumps({
                                "receiver_id": receiver_id,
                                "message": message
                            })
                        )
                    except ConnectionClosed:
                        print("\n❌ Connection to server lost.")

                        break
            finally:
                receive_task.cancel()
                try:
                    await receive_task
                except asyncio.CancelledError:
                    pass


    except OSError:

        print("\n❌ Could not connect to server.")

        print("Make sure the FastAPI server is running.")
    except ConnectionClosed:
        print("\n❌ Server closed the connection.")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")

    finally:
        print("\nClient closed safely.")

if __name__ == "__main__":
    asyncio.run(main())