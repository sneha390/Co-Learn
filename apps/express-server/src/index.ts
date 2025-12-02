import express from "express";
import { createClient } from "redis";
import cors from "cors";
import { getAiTutorResponse } from "./ai-tutor";
import { connectToDatabase } from "./db/connection";
import ChatMessage from "./models/Chat";
import Room from "./models/Room";
import User from "./models/User";
import Code from "./models/Code";
import Notes from "./models/Notes";
import { v4 as uuidv4 } from "uuid";
import { generateToken, authenticateToken, AuthRequest } from "./utils/auth";

const app = express();
app.use(express.json());
app.use(cors());

const redisClient = createClient();

redisClient.on("error", (err) => console.log("Redis Client Error", err));

// Authentication routes
app.post("/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing required fields: name, email, password" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    // Generate user ID
    const userId = uuidv4();

    // Create new user
    const user = new User({
      _id: userId,
      name,
      email,
      password,
    });

    await user.save();

    // Generate token
    const token = generateToken({ userId: String(user._id), email: user.email });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error("Error signing up:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/auth/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate token
    const token = generateToken({ userId: String(user._id), email: user.email });

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error signing in:", error);
    res.status(500).json({ error: "Failed to sign in" });
  }
});

app.get("/auth/verify", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(500).json({ error: "Failed to verify token" });
  }
});

app.post('/ai-tutor', async (req, res) => {
  const { userQuery, language, code, input, output } = req.body;
  if (!userQuery || !language || !code) {
      return res.status(400).json({ error: "Missing required fields: userQuery, language, or code." });
  }
  try {
      const aiResponseText = await getAiTutorResponse({ userQuery, language, code, input, output });
      res.status(200).json({ aiResponseText });

  } catch (error) {
      console.error("AI Tutor endpoint failed:", error);
      res.status(500).json({ error: "An internal server error occurred while processing the AI request." });
  }
});

app.post("/submit", async (req, res) => {
  const { code, language, roomId, input, sessionId } = req.body;
  const submissionId = `submission-${Date.now()}-${roomId}`;

  console.log(`Received submission from room ${roomId}`);

  try {
    await redisClient.lPush(
      "problems",
      JSON.stringify({ code, language, roomId, submissionId, input, sessionId })
    );
    console.log(
      `Submission pushed to Redis for: ${roomId}  and problem id: ${submissionId}`
    );
    const room = await Room.findOne({ roomId });
    if (room) {
      await Code.findOneAndUpdate(
        { codeId: room.codeId },
        { sourceCode: code, language }
      );
    }
    res.status(200).send("Submission received and stored");
  } catch (error) {
    console.log(error);
    res.status(500).send("Failed to store submission");
  }
});

// Chat endpoints
app.post("/chat/send", async (req, res) => {
  const { chatId, userId, userName, message } = req.body;

  if (!chatId || !userId || !userName || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const chatMessage = new ChatMessage({
      chatId,
      userId,
      userName,
      message,
      timestamp: new Date(),
    });

    await chatMessage.save();
    res.status(200).json({ success: true, message: chatMessage });
  } catch (error) {
    console.error("Error saving chat message:", error);
    res.status(500).json({ error: "Failed to save chat message" });
  }
});

app.get("/chat/:chatId", async (req, res) => {
  const { chatId } = req.params;
  const { limit = 50 } = req.query;

  try {
    const messages = await ChatMessage.find({ chatId })
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .exec();

    res.status(200).json({ messages: messages.reverse() });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    res.status(500).json({ error: "Failed to fetch chat messages" });
  }
});

// Room management endpoints
app.post("/room/create", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Missing roomId" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get authenticated user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const ownerId = String(user._id);

    // Check if room already exists
    let room = await Room.findOne({ roomId });
    if (room) {
      // Add owner to members if not already there
      if (!room.members.includes(ownerId)) {
        room.members.push(ownerId);
        await room.save();
      }
      return res.status(200).json({ room, isNew: false });
    }

    // Create new room with associated entities
    const chatId = uuidv4();
    const notesId = uuidv4();
    const codeId = uuidv4();

    // Create Code
    const code = new Code({
      codeId,
      roomId,
      sourceCode: "// Write your code here...",
      language: "javascript",
    });
    await code.save();

    // Create Notes
    const notes = new Notes({
      notesId,
      roomId,
      content: "",
    });
    await notes.save();

    // Create Room
    room = new Room({
      roomId,
      ownerId,
      members: [ownerId],
      chatId,
      notesId,
      codeId,
    });
    await room.save();

    res.status(200).json({ room, isNew: true });
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.post("/room/join", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Missing roomId" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get authenticated user
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = String(user._id);

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Add user to members if not already there
    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    res.status(200).json({ room });
  } catch (error) {
    console.error("Error joining room:", error);
    res.status(500).json({ error: "Failed to join room" });
  }
});

// Get all rooms for the authenticated user
app.get("/rooms/my", authenticateToken, async (req: AuthRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const rooms = await Room.find({ members: req.user.userId }).sort({ createdAt: -1 });
    res.status(200).json({ rooms });
  } catch (error) {
    console.error("Error fetching user rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

app.get("/room/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.status(200).json({ room });
  } catch (error) {
    console.error("Error fetching room:", error);
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

// Get code for a room
app.get("/code/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const code = await Code.findOne({ codeId: room.codeId });
    if (!code) {
      return res.status(404).json({ error: "Code not found" });
    }

    res.status(200).json({ code });
  } catch (error) {
    console.error("Error fetching code:", error);
    res.status(500).json({ error: "Failed to fetch code" });
  }
});

// Update code for a room
app.put("/code/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { sourceCode, language } = req.body;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const code = await Code.findOneAndUpdate(
      { codeId: room.codeId },
      { sourceCode, language },
      { new: true }
    );

    res.status(200).json({ code });
  } catch (error) {
    console.error("Error updating code:", error);
    res.status(500).json({ error: "Failed to update code" });
  }
});

const server = app.listen(3000, '0.0.0.0', () => {
  console.log("Express Server Listening on port 3000");
});

async function main() {
  try {
    await connectToDatabase();
    await redisClient.connect();

    console.log("Redis Client Connected");
  } catch (error) {
    console.log("Failed to connect to services", error);
  }
}

main();
