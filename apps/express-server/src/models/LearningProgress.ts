import mongoose, { Schema, Document } from 'mongoose';

// Per-user progress inside a learning room.
// This is intentionally simple and checkpoint-centric so that we can
// extend it later with richer analytics without breaking the core flow.

export type CheckpointStatus = 'pending' | 'in_progress' | 'completed';

export interface ICheckpointProgress {
  checkpointId: string;
  status: CheckpointStatus;
  // For explain-to-unlock checkpoints
  explanationText?: string;
  explanationAccepted?: boolean;
  // For reflection checkpoints
  reflectionText?: string;
}

export interface ILearningProgress extends Document {
  roomId: string;
  moduleId: string;
  userId: string;
  currentCheckpointIndex: number;
  checkpoints: ICheckpointProgress[];
  createdAt: Date;
  updatedAt: Date;
}

const CheckpointProgressSchema = new Schema<ICheckpointProgress>(
  {
    checkpointId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    explanationText: {
      type: String,
    },
    explanationAccepted: {
      type: Boolean,
      default: false,
    },
    reflectionText: {
      type: String,
    },
  },
  {
    _id: false,
  }
);

const LearningProgressSchema = new Schema<ILearningProgress>(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    moduleId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
      ref: 'User',
    },
    currentCheckpointIndex: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    checkpoints: {
      type: [CheckpointProgressSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// A user has at most one progress document per (room, module) pair.
LearningProgressSchema.index({ roomId: 1, moduleId: 1, userId: 1 }, { unique: true });

export default mongoose.model<ILearningProgress>('LearningProgress', LearningProgressSchema);

