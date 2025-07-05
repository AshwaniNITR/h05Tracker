import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IParticipant extends Document {
  username: string;
  email: string;
  name: string;
  hackathon_extras: string[];
  createdAt: Date;
}

const participantSchema: Schema<IParticipant> = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  hackathon_extras: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const Participant: Model<IParticipant> = mongoose.models.Participant || mongoose.model<IParticipant>('Participant', participantSchema);

export default Participant;