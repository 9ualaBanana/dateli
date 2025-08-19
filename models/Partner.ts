// models/Partner.ts
import { Schema, model, models } from "mongoose";
const PartnerSchema = new Schema({
  coupleToken: { type: String, index: true, required: true },
  partnerId:   { type: String, unique: true, index: true }, // nanoid for lightweight auth
  displayName: String,
  // Authentication fields
  email: { type: String, unique: true, index: true, sparse: true },
  passwordHash: { type: String },
  emailVerified: { type: Date, default: null },
}, { timestamps: true });
export const Partner = models.Partner || model("Partner", PartnerSchema);
