import mongoose, { Schema, Document } from 'mongoose';

export interface ICode extends Document {
  codeId: string;
  roomId: string;
  sourceCode: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

const CodeSchema: Schema = new Schema(
  {
    codeId: {
      type: String,
      required: true,
      unique: true,
    },
    roomId: {
      type: String,
      required: true,
      ref: 'Room',
    },
    sourceCode: {
      type: String,
      default: '',
    },
    language: {
      type: String,
      default: 'javascript',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICode>('Code', CodeSchema);

