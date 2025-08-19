// models/DateEvent.ts  (agreed dates → ICS)
import { Schema, model, models } from "mongoose";
const DateEventSchema = new Schema({
  coupleToken: { type: String, index: true, required: true },
  uid: { type: String, unique: true, index: true },
  title: { type: String, required: true },
  description: String,
  location: String,
  startUtc: { type: Date, required: true },
  endUtc:   { type: Date, required: true },
  isSurprise: { type: Boolean, default: false },
  sequence: { type: Number, default: 0 },         // for ICS updates
  lastModifiedUtc: { type: Date, default: Date.now }
}, { timestamps: true });
export const DateEvent = models.DateEvent || model("DateEvent", DateEventSchema);
