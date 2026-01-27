import mongoose, { Schema, Document } from 'mongoose';

export interface IAiMessage extends Document {
  roomId: string;
  sender: 'user' | 'ai';
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiMessageSchema: Schema = new Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    sender: {
      type: String,
      required: true,
      enum: ['user', 'ai'],
    },
    text: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying by roomId and timestamp
AiMessageSchema.index({ roomId: 1, createdAt: 1 });

export default mongoose.model<IAiMessage>('AiMessage', AiMessageSchema);

