import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
  roomId: string;
  ownerId: string;
  members: string[];
  chatId: string;
  notesId: string;
  codeId: string;
  // Learning-specific fields. These are optional so that existing free-form
  // collaboration rooms continue to work unchanged.
  isLearningRoom?: boolean;
  moduleId?: string | null;
  currentCheckpointIndex?: number;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema: Schema = new Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    ownerId: {
      type: String,
      required: true,
      ref: 'User',
    },
    members: [
      {
        type: String,
        ref: 'User',
      },
    ],
    chatId: {
      type: String,
      required: true,
      ref: 'Chat',
    },
    notesId: {
      type: String,
      required: true,
      ref: 'Notes',
    },
    codeId: {
      type: String,
      required: true,
      ref: 'Code',
    },
    // Learning flow metadata. These are nullable so that
    // existing rooms created before this feature remain valid.
    isLearningRoom: {
      type: Boolean,
      default: false,
      index: true,
    },
    moduleId: {
      type: String,
      ref: 'LearningModule',
      default: null,
      index: true,
    },
    currentCheckpointIndex: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IRoom>('Room', RoomSchema);

