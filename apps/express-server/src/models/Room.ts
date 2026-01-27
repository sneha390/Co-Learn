import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
  roomId: string;
  ownerId: string;
  members: string[];
  chatId: string;
  notesId: string;
  codeId: string;
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
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IRoom>('Room', RoomSchema);

