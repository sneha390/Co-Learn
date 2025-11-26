import mongoose, { Schema, Document } from 'mongoose';

export interface IChatMessage extends Document {
  chatId: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema: Schema = new Schema(
  {
    chatId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      ref: 'User',
    },
    userName: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying by chatId and timestamp
ChatMessageSchema.index({ chatId: 1, timestamp: -1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);

