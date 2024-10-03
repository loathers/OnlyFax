import type { FaxMessages } from "./utils/messages.js";

export type KOLCredentials = {
  sessionCookies: string;
  pwdhash: string;
};

export interface KoLUser {
  name: string;
  id: string;
}

export interface ChatUser extends KoLUser {
  color?: string;
}

export type MessageType = "private" | "public" | "event" | "system";
export type MessageFormat = null | "0" | "1" | "2" | "3" | "4" | "98" | "99";
export type PublicMessageType =
  | "normal"
  | "emote"
  | "system"
  | "mod warning"
  | "mod announcement"
  | "event"
  | "welcome";

export type KOLMessage = {
  type: MessageType;
  time?: string;
  channel?: string;
  mid?: string;
  who?: ChatUser;
  for?: ChatUser;
  format?: MessageFormat;
  msg?: string;
  link?: string;
  notnew?: string; // Only seen "1"
};

export interface DepositedFax {
  requester: KoLUser;
  clanId?: number;
  clanName?: string;
  fax: MonsterData;
  faxClan?: number;
  requested: number;
  completed?: number;
  outcome: FaxMessages;
  request: string;
}

export type EquipSlot =
  | "hat"
  | "shirt"
  | "pants"
  | "weapon"
  | "offhand"
  | "acc1"
  | "acc2"
  | "acc3"
  | "fakehands"
  | "cardsleeve";

export type KoLStatus = {
  playerid: string;
  name: string;
  turnsPlayed: number;
  adventures: number;
  full: number;
  drunk: number;
  spleen: number;
  rollover: number;
  hp: number;
  mp: number;
  maxHP: number;
  maxMP: number;
  equipment: Map<EquipSlot, number>;
  familiar?: number;
  meat: number;
  level: number;
  effects: KoLEffect[];
  daynumber: number;
};

export type KoLEffect = {
  name: string;
  duration: number;
  id: number;
};

export type CombatMacro = {
  name: string;
  id: string;
};

export type FaxMachine =
  | "Illegal Clan"
  | "No Clan Info"
  | "No Fax Loaded"
  | "Grabbed Fax"
  | "Already have fax"
  | "Sent Fax"
  | "No Fax Machine"
  | "Have no fax to send"
  | "Unknown";
export type ClanJoinAttempt =
  | "Joined"
  | "Not Whitelisted"
  | "Am Clan Leader"
  | "Unknown";

export type ClanType = "Fax Source" | "Random Clan";
export type MonsterCategory = "Unwishable" | "Ambiguous" | "Farming" | "Other";
export const SettingTypes = ["Category", "Noteworthy"] as const;
export type SettingType = (typeof SettingTypes)[number];

export interface MonsterSetting {
  monster: string;
  setting: SettingType;
  value: string;
}

export interface FaxClanData {
  clanId: number;
  clanName: string;
  clanTitle: string; // Title we were given in the clan, null if title unknown
  faxMonsterId?: number; // The monster ID of the fax machine, should only be undefined if no fax machine, or no copy obtainable
  faxMonsterLastChanged?: number;
  clanFirstAdded: number; // UNIX seconds
  clanLastChecked: number; // UNIX seconds
}

export interface MonsterData {
  id: number;
  name: string; // Name as written in mafia data, this isn't to be relied on for direct comparison with kol monster names as kolmafia adds info to monster names when there's dupes and stuff
  manualName?: string; // Name as reported in manual
  category?: MonsterCategory;
}

export interface BotState {
  lastFaxed: number; // KOL Day we last did a fax fight
  lastUpdatedMonsters: number; // KOL Day we last updated monsters source file
  faxRolloverDay: number; // Kol day we're doing a fax rollover on, reset to -1 when it's not a concern anymore
}

export type UserInfo = {
  name: string;
  id: number;
  clan?: UserClan;
};

export type KoLClan = {
  name: string;
  id: number;
};

export interface UserClan extends KoLClan {
  title?: string;
}
export type PhotoInfo = {
  name: string;
  id: number;
};

export interface FaxbotDatabaseMonsterList {
  monsterdata: FaxbotDatabaseMonster[];
}
export interface FaxbotDatabaseMonster {
  name: string; // The name for cosmetic purposes
  actual_name: string; // A mafia recognized monster
  command: string; // What to tell the faxbot to show this monster
  category: string; // What category this monster belongs in
}

export interface FaxbotDatabaseBot {
  name: string;
  playerid: string;
}

export interface FaxbotDatabase {
  botdata: FaxbotDatabaseBot;
  monsterlist: FaxbotDatabaseMonsterList;
}

export interface ClanStatistics {
  sourceClans: number;
  otherClans: number;
}

export interface FaxRequestedCount {
  name: string;
  count: number;
}

export interface FaxStatistics {
  faxesServed: number;
  topFaxes: FaxRequestedCount[];
  topFaxesMonth: FaxRequestedCount[];
}
