import { config } from "../../config.js";
import type {
  DepositedFax,
  FaxClanData,
  KoLClan,
  KoLUser,
  MonsterData,
} from "../../types.js";
import type { KoLClient } from "../../utils/KoLClient.js";
import type { FaxMessages } from "../../utils/messages.js";
import { PHOTOCOPIED_BUTT_ID } from "../monsters.js";

export enum FaxOutcome {
  FAILED,
  TRY_AGAIN,
  SUCCESS,
}

export interface FaxRequest {
  hasFax: boolean;
  targetClan: KoLClan;

  notifyUpdate(message: FaxMessages): Promise<void>;

  getFaxSource(): FaxClanData;

  getExpectedMonster(): string;

  getRequester(): string;
}

export class PlayerFaxRequest implements FaxRequest {
  client: KoLClient;
  player: KoLUser;
  monster: MonsterData;
  targetClan: KoLClan;
  faxAttempt: DepositedFax;
  hasFax: boolean;
  faxSource: FaxClanData;

  constructor(
    client: KoLClient,
    player: KoLUser,
    monster: MonsterData,
    clan: KoLClan,
    fax: DepositedFax,
  ) {
    this.client = client;
    this.player = player;
    this.monster = monster;
    this.targetClan = clan;
    this.faxAttempt = fax;
    this.faxAttempt.clanId = clan.id;
    this.faxAttempt.clanName = clan.name;
  }

  getMonsterName(): string {
    return this.getSpecialName() ?? this.monster.name;
  }

  getSpecialName() {
    if (
      this.monster.id != PHOTOCOPIED_BUTT_ID ||
      this.faxSource == null ||
      this.faxSource.clanTitle == null
    ) {
      return null;
    }

    const match = this.faxSource.clanTitle.match(
      /Source: ([a-zA-Z\d_ ]+'s butt)$/,
    );

    if (match == null) {
      return null;
    }

    return match[1];
  }

  async notifyUpdate(message: FaxMessages) {
    const monsterName = this.getMonsterName();

    let msg = message.replaceAll(`{monster}`, monsterName);
    msg = msg.replaceAll(`{operator}`, config.FAXBOT_OPERATOR);
    msg = msg.replaceAll(`{clan}`, this.faxAttempt?.clanName ?? `Unknown Clan`);

    await this.client.sendPrivateMessage(this.player, msg);

    this.faxAttempt.outcome = message;
  }

  setFaxSource(clan: FaxClanData) {
    this.faxSource = clan;

    if (clan != null) {
      this.faxAttempt.faxClan = clan.clanId;
    }
  }

  getFaxSource(): FaxClanData {
    return this.faxSource;
  }

  getExpectedMonster(): string {
    return this.getMonsterName();
  }

  getRequester(): string {
    return this.player.name;
  }
}
