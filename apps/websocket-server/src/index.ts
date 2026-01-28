import http from "http";
import { WebSocketServer } from "ws";
import { createClient } from "redis";

const server = http.createServer();
const wss = new WebSocketServer({ server });
const pubSubClient = createClient();

// Storage for rooms and their users / metadata
// Shape:
// {
//   [roomId]: {
//     users: { userId, ws, name }[],
//     activeTypistId?: string
//   }
// }
const rooms: any = {};

function generateRoomId() {
  let id;
  do {
    id = Math.floor(100000 + Math.random() * 900000).toString(); 
  } while (rooms[id]);
  return id;
}

async function process() {
  pubSubClient.on("error", (err) =>
    console.log("Redis PubSub Client Error", err)
  );

  wss.on("connection", (ws, req) => {
    console.log("Connection established");

    const queryParams = new URLSearchParams(req.url?.split("?")[1]);
    let roomId = queryParams.get("roomId"); // Get roomId from query param if provided
    const userId = queryParams.get("id"); // Get userId from query param
    const name = queryParams.get("name"); // Get name from query param
    console.log("User id", userId);
    console.log("Room id", roomId);
    console.log("Name", name);

    // If no roomId provided, generate a new roomId
    if (roomId == null || roomId == "") {
      roomId = generateRoomId();
      rooms[roomId] = { users: [], activeTypistId: undefined };
      ws.send(
        JSON.stringify({
          isNewRoom: true,
          type: "roomId",
          roomId,
          message: `Created new room with ID: ${roomId}`,
        })
      );
      console.log(`Created new room with ID: ${roomId}`);
    } else {
      // RoomId provided - create room entry in memory if it doesn't exist
      // (room existence is validated by database on frontend via /room/join)
      if (!rooms[roomId]) {
        rooms[roomId] = { users: [], activeTypistId: undefined };
        console.log(`Creating room entry in memory for existing room: ${roomId}`);
      }
      console.log(`Joining room with ID: ${roomId}`);
      ws.send(
        JSON.stringify({
          isNewRoom: false,
          type: "roomId",
          roomId,
          message: `Joined room with ID: ${roomId}`,
        })
      );
    }
    const users = rooms[roomId].users.map((user: any) => ({
      id: user.userId,
      name: user.name,
    }));
    rooms[roomId].users.forEach((user: any) => {
      user.ws.send(JSON.stringify({ type: "users", users }));
    });

    rooms[roomId].users.push({ userId, ws, name });

    // If there is no active typist yet, claim the role for the first user.
    if (!rooms[roomId].activeTypistId) {
      rooms[roomId].activeTypistId = userId;
    }
    // Always notify everyone who the current active typist is.
    rooms[roomId].users.forEach((user: any) => {
      user.ws.send(
        JSON.stringify({
          type: "activeTypist",
          activeTypistId: rooms[roomId].activeTypistId,
        })
      );
    });
    console.log("all room", rooms);

    pubSubClient.subscribe(roomId, (message) => {
      // Broadcast message to all users in the room
      const { result, sessionId } = JSON.parse(message);
      rooms[roomId].users.forEach((user: any) => {
        if (user.userId === userId) {
          user.ws.send(JSON.stringify({
            type: "output",
            message: result,
            sessionId
          }));
          console.log("Output sent to user id", user.userId, "with sessionId", sessionId);
        }
      });
    });

    ws.on("message", (message) => {
      const data = JSON.parse(message.toString());

      console.log("Message received", data.type);

      // handle request from user and send it all back to all users in the room
      if (data.type === "requestToGetUsers") {
        const users = rooms[roomId].users.map((user: any) => ({
          id: user.userId,
          name: user.name,
        }));
        console.log("request recived");

        const payload = {
          type: "users",
          users,
          activeTypistId: rooms[roomId].activeTypistId ?? null,
        };
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(JSON.stringify(payload));
        });
      }

      // request for starter data on new user join
      if (data.type == "requestForAllData") {


        const otherUser = rooms[roomId].users.find(
          (user: any) => user.userId !== userId
        );
        if (otherUser) {
          console.log("sending request to", otherUser.name);
          otherUser.ws.send(
            JSON.stringify({
              type: "requestForAllData",
              userId: userId,
            })
          );
        }
      }

      // handle code change and send it to all users in the room
      if (data.type === "code") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.userId != userId) {
            user.ws.send(JSON.stringify({ type: "code", code: data.code }));
          }
        });
      }
      // handle input change and send it to all users in the room
      if (data.type === "input") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.userId != userId) {
            user.ws.send(JSON.stringify({ type: "input", input: data.input }));
          }
        });
      }

      // handle language change and send it to all users in the room
      if (data.type === "language") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.userId != userId) {
            user.ws.send(
              JSON.stringify({ type: "language", language: data.language })
            );
          }
        });
      }

      // handle submit button status
      if (data.type === "submitBtnStatus") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.userId != userId) {
            user.ws.send(
              JSON.stringify({
                type: "submitBtnStatus",
                value: data.value,
                isLoading: data.isLoading,

              })
            );
          }
        });
      }

      // handle user added
      if (data.type === "users") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.userId != userId) {
            user.ws.send(JSON.stringify({ type: "users", users: data.users }));
          }
        });
      }

      // send all data to new user
      if (data.type === "allData") {


        rooms[roomId].users.forEach((user: any) => {
          if (user.userId === data.userId) {
            console.log("sending all data to", user.name, "and data is", data);

            user.ws.send(
              JSON.stringify({
                type: "allData",
                code: data.code,
                input: data.input,
                language: data.language,
                currentButtonState: data.currentButtonState,
                isLoading: data.isLoading,
              })
            );
          }
        });
      }

      // send current cursor position to all users in the room
      if (data.type === "cursorPosition") {
        rooms[roomId].users.forEach((user: any) => {
          if (user.userId != userId) {
            user.ws.send(
              JSON.stringify({
                type: "cursorPosition",
                cursorPosition: data.cursorPosition,
                userId: userId,
              })
            );
          }
        });
      }

      // handle chat message and broadcast to all users in the room
      if (data.type === "chat") {
        const chatMessage = {
          userId: userId,
          userName: name,
          message: data.message,
          timestamp: new Date().toISOString(),
        };

        // Broadcast to all users in the room (including sender)
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              chatMessage: chatMessage,
            })
          );
        });
      }

      // ----- Learning-specific collaboration rules -----
      // Only one active typist at a time. Others can request control.
      if (data.type === "requestTypingControl") {
        // For now we use a simple policy:
        // - If no active typist, grant control to requester.
        // - If requester is already active typist, nothing to do.
        // - Otherwise, transfer control immediately.
        // This can be extended later to require approval.
        rooms[roomId].activeTypistId = userId;
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(
            JSON.stringify({
              type: "activeTypist",
              activeTypistId: rooms[roomId].activeTypistId,
            })
          );
        });
      }
      if (data.type === "releaseTypingControl") {
        // If the current typist releases control, clear it.
        if (rooms[roomId].activeTypistId === userId) {
          rooms[roomId].activeTypistId = undefined;
          rooms[roomId].users.forEach((user: any) => {
            user.ws.send(
              JSON.stringify({
                type: "activeTypist",
                activeTypistId: rooms[roomId].activeTypistId,
              })
            );
          });
        }
      }

      // When one user starts a learning module for the room, notify everyone
      // so that all clients can navigate into the learning experience.
      if (data.type === "startLearningModule") {
        rooms[roomId].users.forEach((user: any) => {
          user.ws.send(
            JSON.stringify({
              type: "enterLearningModule",
              moduleId: data.moduleId,
            })
          );
        });
      }
    });

    ws.on("close", () => {
      // remove user from room
      rooms[roomId].users = rooms[roomId].users.filter(
        (user: any) => user.userId !== userId
      );

      // If the departing user was the active typist, clear control.
      if (rooms[roomId].activeTypistId === userId) {
        rooms[roomId].activeTypistId = undefined;
      }

      // send updated users list to all users in the room
      rooms[roomId].users.forEach((user: any) => {
        user.ws.send(
          JSON.stringify({
            type: "users",
            users: rooms[roomId].users.map((u: any) => ({
              id: u.userId,
              name: u.name,
            })),
          })
        );
      });
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
        pubSubClient.unsubscribe(roomId);
      }

      console.log("all room", rooms);
    });
  });

  wss.on("listening", () => {
    const addr: any = server.address();
    console.log(`Server listening on port ${addr.port}`);
  });

  server.listen(5000, '0.0.0.0', () => {
    console.log("web socket server started on 5000");
  });
}
async function main() {
  try {
    await pubSubClient.connect();
    await process();
    console.log("Redis Client Connected");
  } catch (error) {
    console.log("Failed to connect to Redis", error);
  }
}

main();
