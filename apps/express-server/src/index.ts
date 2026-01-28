import { config } from "dotenv";
import path from "path";

// Load .env from project root
config({ path: path.resolve(__dirname, "../../../.env") });
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
import AiMessage from "./models/AiMessage";
import LearningModule, { ICheckpoint, ILearningModule } from "./models/LearningModule";
import LearningProgress from "./models/LearningProgress";
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
  const {
    userQuery,
    language,
    code,
    input,
    output,
    roomId,
    checkpointType,
    checkpointTitle,
    checkpointDescription,
    aiMode,
  } = req.body;
  if (!userQuery || !language || !code) {
      return res.status(400).json({ error: "Missing required fields: userQuery, language, or code." });
  }
  try {
      const aiResponseText = await getAiTutorResponse({
        userQuery,
        language,
        code,
        input,
        output,
        checkpointType,
        checkpointTitle,
        checkpointDescription,
        aiMode,
      });
      
      // Save user message and AI response to database if roomId is provided
      if (roomId) {
        try {
          const userMessage = new AiMessage({
            roomId,
            sender: 'user',
            text: userQuery,
          });
          await userMessage.save();

          const aiMessage = new AiMessage({
            roomId,
            sender: 'ai',
            text: aiResponseText,
          });
          await aiMessage.save();
        } catch (dbError) {
          console.error("Error saving AI messages to database:", dbError);
          // Don't fail the request if DB save fails
        }
      }
      
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
    // Include ownerId in response
    const roomsWithOwner = rooms.map(room => ({
      roomId: room.roomId,
      ownerId: room.ownerId,
      members: room.members,
    }));
    res.status(200).json({ rooms: roomsWithOwner });
  } catch (error) {
    console.error("Error fetching user rooms:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

/**
 * ---------- Learning modules & rooms ----------
 *
 * These endpoints provide a minimal but structured learning flow
 * on top of existing collaborative rooms. The goal is to keep
 * schemas small and extensible while supporting:
 * - A single beginner module ("Loops for Beginners") to start with
 * - Checkpoint-driven progress inside a room
 * - Per-user progress tracking that can later be enriched
 */

// Helper: ensure that our initial "Loops for Beginners" module exists.
async function ensureDefaultLearningModules() {
  const existing = await LearningModule.findOne({ moduleId: "loops-beginners" });
  if (existing) {
    return;
  }

  const checkpoints: ICheckpoint[] = [
    {
      checkpointId: "loops-1-predict-output",
      title: "Predict simple loop output",
      type: "predict-output",
      summary: "Mentally trace a basic for-loop and predict its output.",
      description:
        "Look at the code below and, **without running it**, work together to predict exactly what will be printed.\n\nFocus on understanding how the loop variable changes and how many times the body executes.",
      starterCode: `# Python
for i in range(1, 4):
    print("Loop:", i)
`,
      readOnlyCode: true,
      expectedOutput: `Loop: 1
Loop: 2
Loop: 3`,
      requirePeerReview: false,
      aiMode: "socratic",
    },
    {
      checkpointId: "loops-2-fix-code",
      title: "Fix an off-by-one error",
      type: "fix-code",
      summary: "Debug a loop that runs too many or too few times.",
      description:
        "The following loop is supposed to print the numbers 1 through 5, one per line. Work together to identify the bug and fix it.\n\nDiscuss **why** the bug happens before changing the code.",
      starterCode: `# Python
for i in range(0, 6):
    print(i)
`,
      readOnlyCode: false,
      requirePeerReview: true,
      aiMode: "hint",
    },
    {
      checkpointId: "loops-3-write-code",
      title: "Write your own loop",
      type: "write-code",
      summary: "Collaboratively write a loop from scratch.",
      description:
        "Write a loop that prints all even numbers from 2 to 10.\n\nTry to:\n- Decide together on the loop bounds\n- Choose a good variable name\n- Keep the code readable and consistent",
      starterCode: `# Python
# TODO: print all even numbers from 2 to 10
`,
      readOnlyCode: false,
      requirePeerReview: true,
      aiMode: "hint",
    },
    {
      checkpointId: "loops-4-explain",
      title: "Explain loops in your own words",
      type: "explain-to-unlock",
      summary: "Explain how loops work before moving on.",
      description:
        "One learner should write a short explanation (3–5 sentences) of **how a basic for-loop works** in Python.\n\nOthers can add comments or suggest improvements. The AI guide will review the explanation for clarity and basic correctness. Only then will the next checkpoint unlock.",
      readOnlyCode: true,
      aiMode: "review",
    },
    {
      checkpointId: "loops-5-reflection",
      title: "Reflection: what did you learn?",
      type: "reflection",
      summary: "Capture personal takeaways from this module.",
      description:
        "Each learner should write a short reflection (2–4 sentences) about what they learned about loops, and what still feels confusing.\n\nBe honest; this is for your future self and your peers.",
      readOnlyCode: true,
      aiMode: "summarizer",
    },
  ];

  await LearningModule.create({
    moduleId: "loops-beginners",
    title: "Loops for Beginners",
    language: "python",
    difficulty: "beginner",
    estimatedTimeMinutes: 25,
    checkpoints,
  } as Partial<ILearningModule>);
}

// List available learning modules (for now, a single path).
app.get("/learning/modules", async (_req, res) => {
  try {
    const modules = await LearningModule.find(
      {},
      "moduleId title language difficulty estimatedTimeMinutes"
    ).lean();
    res.status(200).json({ modules });
  } catch (error) {
    console.error("Error fetching learning modules:", error);
    res.status(500).json({ error: "Failed to fetch learning modules" });
  }
});

// Get a single module with all checkpoints
app.get("/learning/modules/:moduleId", async (req, res) => {
  const { moduleId } = req.params;
  try {
    const module = await LearningModule.findOne({ moduleId }).lean();
    if (!module) {
      return res.status(404).json({ error: "Module not found" });
    }
    res.status(200).json({ module });
  } catch (error) {
    console.error("Error fetching learning module:", error);
    res.status(500).json({ error: "Failed to fetch learning module" });
  }
});

// Create a learning room tied to a module.
// This reuses the existing room structure but marks it as a learning room
// and initializes the room-level checkpoint index.
app.post("/learning/room/create", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId, moduleId } = req.body;

  if (!roomId || !moduleId) {
    return res.status(400).json({ error: "Missing roomId or moduleId" });
  }

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const module = await LearningModule.findOne({ moduleId });
    if (!module) {
      return res.status(404).json({ error: "Module not found" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const ownerId = String(user._id);

    let room = await Room.findOne({ roomId });
    if (room) {
      const existingModuleId = room.moduleId != null ? String(room.moduleId).trim() : null;
      const requestedModuleId = String(module.moduleId).trim();
      // Reject only when the room is already bound to a different module.
      if (room.isLearningRoom && existingModuleId && existingModuleId !== requestedModuleId) {
        return res
          .status(400)
          .json({ error: "Room is already a learning room for a different module" });
      }

      // Upgrade to learning room or (re)bind module/code when not yet set.
      const needsModuleBinding = !room.isLearningRoom || !existingModuleId;
      if (needsModuleBinding) {
        room.isLearningRoom = true;
        room.moduleId = module.moduleId;
        room.currentCheckpointIndex = 0;
        await room.save();

        const firstCheckpoint = module.checkpoints[0];
        if (firstCheckpoint) {
          await Code.findOneAndUpdate(
            { codeId: room.codeId },
            {
              sourceCode:
                firstCheckpoint.starterCode ||
                "# Python\n# Learning room code will be set per checkpoint.\n",
              language: module.language,
            }
          );
        }
      }

      if (!room.members.includes(ownerId)) {
        room.members.push(ownerId);
        await room.save();
      }
    } else {
      const chatId = uuidv4();
      const notesId = uuidv4();
      const codeId = uuidv4();

      const code = new Code({
        codeId,
        roomId,
        // For learning rooms the actual starting code usually comes from the module,
        // but we keep a generic default here so the rest of the system continues to work.
        sourceCode:
          module.checkpoints[0]?.starterCode ||
          "# Python\n# Learning room code will be set per checkpoint.\n",
        language: module.language,
      });
      await code.save();

      const notes = new Notes({
        notesId,
        roomId,
        content: "",
      });
      await notes.save();

      room = new Room({
        roomId,
        ownerId,
        members: [ownerId],
        chatId,
        notesId,
        codeId,
        isLearningRoom: true,
        moduleId: module.moduleId,
        currentCheckpointIndex: 0,
      });
      await room.save();
    }

    // Initialize per-user learning progress if not present.
    const existingProgress = await LearningProgress.findOne({
      roomId: room.roomId,
      moduleId: module.moduleId,
      userId: ownerId,
    });

    if (!existingProgress) {
      await LearningProgress.create({
        roomId: room.roomId,
        moduleId: module.moduleId,
        userId: ownerId,
        currentCheckpointIndex: 0,
        checkpoints: module.checkpoints.map((cp, index) => ({
          checkpointId: cp.checkpointId,
          status: index === 0 ? "in_progress" : "pending",
        })),
      });
    }

    res.status(200).json({
      room: {
        roomId: room.roomId,
        ownerId: room.ownerId,
        members: room.members,
        isLearningRoom: room.isLearningRoom,
        moduleId: room.moduleId,
        currentCheckpointIndex: room.currentCheckpointIndex ?? 0,
      },
      module: {
        moduleId: module.moduleId,
        title: module.title,
        language: module.language,
        difficulty: module.difficulty,
        estimatedTimeMinutes: module.estimatedTimeMinutes,
        checkpoints: module.checkpoints,
      },
    });
  } catch (error) {
    console.error("Error creating learning room:", error);
    res.status(500).json({ error: "Failed to create learning room" });
  }
});

// Get the learning state for a room: module, checkpoints and
// aggregated progress for the current user.
app.get("/learning/room/:roomId/state", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const room = await Room.findOne({ roomId });
    if (!room || !room.isLearningRoom || !room.moduleId) {
      return res.status(404).json({ error: "Learning room not found" });
    }

    const module = await LearningModule.findOne({ moduleId: room.moduleId });
    if (!module) {
      return res.status(404).json({ error: "Module not found for room" });
    }

    const progress = await LearningProgress.findOne({
      roomId: room.roomId,
      moduleId: module.moduleId,
      userId: req.user.userId,
    });

    res.status(200).json({
      room: {
        roomId: room.roomId,
        ownerId: room.ownerId,
        members: room.members,
        isLearningRoom: room.isLearningRoom,
        moduleId: room.moduleId,
        currentCheckpointIndex: room.currentCheckpointIndex ?? 0,
      },
      module,
      progress,
    });
  } catch (error) {
    console.error("Error fetching learning room state:", error);
    res.status(500).json({ error: "Failed to fetch learning room state" });
  }
});

// Mark a checkpoint as completed for the current user.
app.post(
  "/learning/room/:roomId/checkpoints/:checkpointId/complete",
  authenticateToken,
  async (req: AuthRequest, res) => {
    const { roomId, checkpointId } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.isLearningRoom || !room.moduleId) {
        return res.status(404).json({ error: "Learning room not found" });
      }

      const module = await LearningModule.findOne({ moduleId: room.moduleId });
      if (!module) {
        return res.status(404).json({ error: "Module not found for room" });
      }

      const progress = await LearningProgress.findOneAndUpdate(
        {
          roomId: room.roomId,
          moduleId: module.moduleId,
          userId: req.user.userId,
          "checkpoints.checkpointId": checkpointId,
        },
        {
          $set: {
            "checkpoints.$.status": "completed",
          },
        },
        { new: true }
      );

      if (!progress) {
        return res.status(404).json({ error: "Progress not found for this checkpoint" });
      }

      res.status(200).json({ progress });
    } catch (error) {
      console.error("Error completing checkpoint:", error);
      res.status(500).json({ error: "Failed to complete checkpoint" });
    }
  }
);

// Submit an explanation for an explain-to-unlock checkpoint.
// The AI reviews the explanation and we record whether it is accepted.
app.post(
  "/learning/room/:roomId/checkpoints/:checkpointId/explain",
  authenticateToken,
  async (req: AuthRequest, res) => {
    const { roomId, checkpointId } = req.params;
    const { explanation } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!explanation || typeof explanation !== "string") {
      return res.status(400).json({ error: "Missing explanation" });
    }

    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.isLearningRoom || !room.moduleId) {
        return res.status(404).json({ error: "Learning room not found" });
      }

      const module = await LearningModule.findOne({ moduleId: room.moduleId });
      if (!module) {
        return res.status(404).json({ error: "Module not found for room" });
      }

      const checkpoint = module.checkpoints.find((cp) => cp.checkpointId === checkpointId);
      if (!checkpoint || checkpoint.type !== "explain-to-unlock") {
        return res.status(400).json({ error: "Checkpoint is not explain-to-unlock" });
      }

      // Ask the AI (in review mode) to evaluate the explanation.
      const reviewPrompt = `A learner wrote the following explanation for this checkpoint.

Checkpoint: ${checkpoint.title}
Description:
${checkpoint.description}

Learner explanation:
${explanation}

Evaluate whether this explanation shows a basic but correct understanding.
Keep your response short (4–6 sentences). At the end, add a final line:
ACCEPT: yes
or
ACCEPT: no
`;

      const aiResponseText = await getAiTutorResponse({
        userQuery: reviewPrompt,
        language: "plaintext",
        code: "",
        input: "",
        output: "",
        checkpointType: checkpoint.type,
        checkpointTitle: checkpoint.title,
        checkpointDescription: checkpoint.description,
        aiMode: "review",
      });

      // Simple parser: look for "ACCEPT: yes" in the AI's response.
      const accepted = /ACCEPT:\s*yes/i.test(aiResponseText || "");

      const progress = await LearningProgress.findOneAndUpdate(
        {
          roomId: room.roomId,
          moduleId: module.moduleId,
          userId: req.user.userId,
          "checkpoints.checkpointId": checkpointId,
        },
        {
          $set: {
            "checkpoints.$.explanationText": explanation,
            "checkpoints.$.explanationAccepted": accepted,
            "checkpoints.$.status": accepted ? "completed" : "in_progress",
          },
        },
        { new: true }
      );

      res.status(200).json({
        accepted,
        feedback: aiResponseText,
        progress,
      });
    } catch (error) {
      console.error("Error evaluating explanation:", error);
      res.status(500).json({ error: "Failed to evaluate explanation" });
    }
  }
);

// Advance the room to the next checkpoint if conditions are satisfied.
// For checkpoints that require peer review, we conservatively require
// at least two members to have completed that checkpoint.
app.post(
  "/learning/room/:roomId/next",
  authenticateToken,
  async (req: AuthRequest, res) => {
    const { roomId } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.isLearningRoom || !room.moduleId) {
        return res.status(404).json({ error: "Learning room not found" });
      }

      const module = await LearningModule.findOne({ moduleId: room.moduleId });
      if (!module) {
        return res.status(404).json({ error: "Module not found for room" });
      }

      const currentIndex = room.currentCheckpointIndex ?? 0;
      if (currentIndex >= module.checkpoints.length) {
        return res.status(400).json({ error: "Module already completed" });
      }

      const currentCp = module.checkpoints[currentIndex];

      // Fetch all progress docs for this room/module.
      const progresses = await LearningProgress.find({
        roomId: room.roomId,
        moduleId: module.moduleId,
      }).lean();

      // Count how many users have completed this checkpoint.
      const completedCount = progresses.reduce((acc, p) => {
        const cpProg = p.checkpoints.find((cp) => cp.checkpointId === currentCp.checkpointId);
        if (cpProg && cpProg.status === "completed") {
          return acc + 1;
        }
        return acc;
      }, 0);

      // For explain-to-unlock, we also require that at least one explanation was accepted.
      if (currentCp.type === "explain-to-unlock") {
        const hasAcceptedExplanation = progresses.some((p) => {
          const cpProg = p.checkpoints.find((cp) => cp.checkpointId === currentCp.checkpointId);
          return cpProg && cpProg.explanationAccepted;
        });
        if (!hasAcceptedExplanation) {
          return res.status(400).json({ error: "Explanation not yet accepted for this checkpoint" });
        }
      }

      // If peer review is required, we require at least two completions.
      if (currentCp.requirePeerReview && completedCount < 2) {
        return res.status(400).json({ error: "Not enough peers have completed this checkpoint yet" });
      }

      // All good: advance the room-level checkpoint index.
      room.currentCheckpointIndex = Math.min(
        currentIndex + 1,
        module.checkpoints.length - 1
      );
      await room.save();

      // Optionally, we can also bump each user's "currentCheckpointIndex" forward
      // to keep their personal pointer aligned with the room.
      await LearningProgress.updateMany(
        {
          roomId: room.roomId,
          moduleId: module.moduleId,
        },
        {
          $set: {
            currentCheckpointIndex: room.currentCheckpointIndex,
          },
        }
      );

      res.status(200).json({
        room: {
          roomId: room.roomId,
          currentCheckpointIndex: room.currentCheckpointIndex,
        },
      });
    } catch (error) {
      console.error("Error advancing to next checkpoint:", error);
      res.status(500).json({ error: "Failed to advance checkpoint" });
    }
  }
);

// Move the room back to the previous checkpoint (if any).
// This is intentionally less strict than "next" – we allow going back
// without additional gating, so groups can review earlier material.
app.post(
  "/learning/room/:roomId/previous",
  authenticateToken,
  async (req: AuthRequest, res) => {
    const { roomId } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.isLearningRoom || !room.moduleId) {
        return res.status(404).json({ error: "Learning room not found" });
      }

      const module = await LearningModule.findOne({ moduleId: room.moduleId });
      if (!module) {
        return res.status(404).json({ error: "Module not found for room" });
      }

      const currentIndex = room.currentCheckpointIndex ?? 0;
      if (currentIndex <= 0) {
        return res.status(400).json({ error: "Already at the first checkpoint" });
      }

      room.currentCheckpointIndex = currentIndex - 1;
      await room.save();

      await LearningProgress.updateMany(
        {
          roomId: room.roomId,
          moduleId: module.moduleId,
        },
        {
          $set: {
            currentCheckpointIndex: room.currentCheckpointIndex,
          },
        }
      );

      res.status(200).json({
        room: {
          roomId: room.roomId,
          currentCheckpointIndex: room.currentCheckpointIndex,
        },
      });
    } catch (error) {
      console.error("Error moving to previous checkpoint:", error);
      res.status(500).json({ error: "Failed to move to previous checkpoint" });
    }
  }
);

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

// Delete a room (only owner can delete)
app.delete("/room/:roomId", authenticateToken, async (req: AuthRequest, res) => {
  const { roomId } = req.params;

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is the owner
    if (room.ownerId !== req.user.userId) {
      return res.status(403).json({ error: "Only the room owner can delete the room" });
    }

    // Delete associated entities
    await Code.deleteOne({ codeId: room.codeId });
    await Notes.deleteOne({ notesId: room.notesId });
    await ChatMessage.deleteMany({ chatId: room.chatId });
    await AiMessage.deleteMany({ roomId: room.roomId });

    // Delete the room
    await Room.deleteOne({ roomId });

    res.status(200).json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("Error deleting room:", error);
    res.status(500).json({ error: "Failed to delete room" });
  }
});

// Get all room data (code, language, AI messages, chat)
app.get("/room/:roomId/data", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Fetch code
    const code = await Code.findOne({ codeId: room.codeId });
    
    // Fetch AI messages
    const aiMessages = await AiMessage.find({ roomId })
      .sort({ createdAt: 1 })
      .exec();

    // Fetch chat messages
    const chatMessages = await ChatMessage.find({ chatId: room.chatId })
      .sort({ timestamp: 1 })
      .limit(50)
      .exec();

    res.status(200).json({
      code: code?.sourceCode || "// Write your code here...",
      language: code?.language || "javascript",
      aiMessages: aiMessages.map(msg => ({
        sender: msg.sender,
        text: msg.text,
      })),
      chatMessages: chatMessages.map(msg => ({
        userId: msg.userId,
        userName: msg.userName,
        message: msg.message,
        timestamp: msg.timestamp,
      })),
    });
  } catch (error) {
    console.error("Error fetching room data:", error);
    res.status(500).json({ error: "Failed to fetch room data" });
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

    // Seed initial learning modules once database is available.
    await ensureDefaultLearningModules();

    console.log("Redis Client Connected");
  } catch (error) {
    console.log("Failed to connect to services", error);
  }
}

main();
