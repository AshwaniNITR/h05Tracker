import mongoose, { Document, Model, Schema } from 'mongoose';

// Participant Schema
export interface IParticipant extends Document {
  username: string;
  email: string;
  name: string;
  hackathon_extras: string[];
  createdAt: Date;
  lastUpdated: Date;
}

const participantSchema: Schema<IParticipant> = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  hackathon_extras: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now }
});

// Add index for better performance (username already has unique index)
participantSchema.index({ lastUpdated: 1 });

const Participant: Model<IParticipant> = mongoose.models.Participant || mongoose.model<IParticipant>('Participant', participantSchema);

// Sync State Schema - separate collection for tracking sync progress
export interface ISyncState extends Document {
  hackathonId: string;
  lastProcessedIndex: number;
  lastSyncTime: Date;
  totalParticipants: number;
  isActive: boolean;
  batchSize: number;
}

const syncStateSchema: Schema<ISyncState> = new Schema({
  hackathonId: { type: String, required: true, unique: true },
  lastProcessedIndex: { type: Number, default: 0 },
  lastSyncTime: { type: Date, default: Date.now },
  totalParticipants: { type: Number, default: 0 },
  isActive: { type: Boolean, default: false }, // Prevent concurrent syncs
  batchSize: { type: Number, default: 10 }
});

const SyncState: Model<ISyncState> = mongoose.models.SyncState || mongoose.model<ISyncState>('SyncState', syncStateSchema);

export { Participant, SyncState };
export default Participant;