import type { EnvType } from "ts-dotenv";
import { load } from "ts-dotenv";

export const schema = {
  FAXBOT_USERNAME: String,
  FAXBOT_PASSWORD: String,

  FAXBOT_OPERATOR: String,

  DEFAULT_CLAN: Number,
  FAX_DUMP_CLAN: Number,

  RUN_FAX_ROLLOVER: Boolean,
  RUN_DANGEROUS_FAX_ROLLOVER: Boolean,

  BOT_CONTROLLERS: String
};

export type Env = EnvType<typeof schema>;

// Do not attempt to load if in testing environment
export const config = load(schema);
