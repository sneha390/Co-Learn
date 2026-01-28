import mongoose, { Schema, Document } from 'mongoose';

// NOTE: Keep this intentionally simple and extensible.
// Checkpoints are embedded inside a module document so that a module
// can be treated as a single versioned unit.

export type CheckpointType =
  | 'predict-output'
  | 'fix-code'
  | 'write-code'
  | 'explain-to-unlock'
  | 'reflection';

export type AiMode = 'socratic' | 'hint' | 'review' | 'summarizer';

export interface ICheckpoint {
  checkpointId: string;
  title: string;
  type: CheckpointType;
  // Short description shown in the left checkpoint list
  summary: string;
  // Detailed instructions + learning goal shown in the center panel
  description: string;
  // Optional starter code or snippet for the code editor
  starterCode?: string;
  // If true, code in the editor is read-only for this checkpoint
  readOnlyCode?: boolean;
  // For predict-output checkpoints we keep a simple expected output string.
  expectedOutput?: string;
  // For some checkpoints we can require explicit peer review before progressing.
  requirePeerReview?: boolean;
  // Default AI mode for this checkpoint. The frontend can override
  // but should generally respect this to keep the AI constrained.
  aiMode: AiMode;
}

export interface ILearningModule extends Document {
  moduleId: string; // Stable identifier, e.g. "loops-beginners"
  title: string;
  language: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTimeMinutes: number;
  checkpoints: ICheckpoint[];
  createdAt: Date;
  updatedAt: Date;
}

const CheckpointSchema = new Schema<ICheckpoint>(
  {
    checkpointId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['predict-output', 'fix-code', 'write-code', 'explain-to-unlock', 'reflection'],
    },
    summary: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    starterCode: {
      type: String,
    },
    readOnlyCode: {
      type: Boolean,
      default: false,
    },
    expectedOutput: {
      type: String,
    },
    requirePeerReview: {
      type: Boolean,
      default: false,
    },
    aiMode: {
      type: String,
      required: true,
      enum: ['socratic', 'hint', 'review', 'summarizer'],
    },
  },
  {
    _id: false,
  }
);

const LearningModuleSchema = new Schema<ILearningModule>(
  {
    moduleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    language: {
      type: String,
      required: true,
      trim: true,
      // For now we support a single language per module.
      // This can be generalized later if needed.
    },
    difficulty: {
      type: String,
      required: true,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    estimatedTimeMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    checkpoints: {
      type: [CheckpointSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ILearningModule>('LearningModule', LearningModuleSchema);

