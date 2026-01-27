import mongoose, { Schema, Document } from 'mongoose';

export interface INotes extends Document {
  notesId: string;
  roomId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotesSchema: Schema = new Schema(
  {
    notesId: {
      type: String,
      required: true,
      unique: true,
    },
    roomId: {
      type: String,
      required: true,
      ref: 'Room',
    },
    content: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<INotes>('Notes', NotesSchema);

