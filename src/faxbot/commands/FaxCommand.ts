import type { KoLUser } from "../../types.js";

export interface FaxCommand {
  isRestricted(): boolean;

  name(): string;

  description(): string;

  execute(sender: KoLUser, parameters: string, isAdmin: boolean): Promise<void>;
}
