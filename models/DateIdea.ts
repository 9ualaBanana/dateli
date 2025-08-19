// models/DateIdea.ts
import { Schema, model, models } from "mongoose";
const DateIdeaSchema = new Schema({
  coupleToken: { type: String, index: true, required: true },
  source: { type: String, enum: ["manual", "ai"], required: true },
  title: { type: String, required: true },
  description: String,
  location: String,
  tags: [String],
}, { timestamps: true });
export const DateIdea = models.DateIdea || model("DateIdea", DateIdeaSchema);
