// models/DateSuggestion.ts
import { Schema, model, models } from "mongoose";

const VoteSchema = new Schema({
  partnerId: { type: String, required: true },
  vote: { type: String, enum: ["up", "down"], required: true },
  at: { type: Date, default: Date.now }
}, { _id: false });

const DateSuggestionSchema = new Schema({
  coupleToken: { type: String, index: true, required: true },
  ideaId: { type: Schema.Types.ObjectId, ref: "DateIdea", required: true },
  // proposed timeslot
  startUtc: { type: Date, required: true },
  endUtc:   { type: Date, required: true },
  // freeform tweaks (overrides idea fields for this suggestion)
  titleOverride: String,
  descriptionOverride: String,
  locationOverride: String,

  status: { type: String, enum: ["pending", "accepted", "cancelled"], default: "pending", index: true },
  votes: { type: [VoteSchema], default: [] },

  acceptedBy: { type: String }, // partnerId who accepted
  acceptedAt: Date,
  eventUid:   String,           // if accepted, link to DateEvent.uid
}, { timestamps: true });

export const DateSuggestion = models.DateSuggestion || model("DateSuggestion", DateSuggestionSchema);
