import { config } from "../../config";
import type { FaxMessages } from "../../utils/FaxMessages";
import type { KoLClient } from "../../utils/KoLClient";
import type {
  DepositedFax,
  FaxClanData,
  KoLClan,
  KoLUser,
  MonsterData
} from "../../utils/Typings";
import { getClanByMonster } from "../managers/ClanManager";

export enum FaxOutcome {
  FAILED,
  TRY_AGAIN,
  SUCCESS
}

export interface FaxRequest {
  hasFax: boolean;

  getClan(): Promise<KoLClan>;

  notifyUpdate(message: FaxMessages): void;

  getFaxSource(): FaxClanData;

  getExpectedMonster(): string;

  getRequester(): string;
}

export class RolloverFaxRequest implements FaxRequest {
  hasFax: boolean;
  clan: FaxClanData;
  clanPromise: Promise<KoLClan>;
  monsterName: string;

  constructor(clan: FaxClanData) {
    this.clan = clan;
    this.monsterName = clan.faxMonster;
    this.clanPromise = new Promise((res) =>
      res({ id: clan.clanId, name: clan.clanName })
    );
  }

  getClan(): Promise<KoLClan> {
    return this.clanPromise;
  }

  notifyUpdate(message: FaxMessages): void {}

  getFaxSource(): FaxClanData {
    return this.clan;
  }

  getExpectedMonster(): string {
    return this.monsterName;
  }

  getRequester(): string {
    return `<Fax Rollover>`;
  }
}

export class PlayerFaxRequest implements FaxRequest {
  client: KoLClient;
  player: KoLUser;
  monster: MonsterData;
  targetClanPromise: Promise<KoLClan>;
  faxAttempt: DepositedFax;
  hasFax: boolean;

  constructor(
    client: KoLClient,
    player: KoLUser,
    monster: MonsterData,
    clan: Promise<KoLClan>,
    fax: DepositedFax
  ) {
    this.client = client;
    this.player = player;
    this.monster = monster;
    this.targetClanPromise = clan;
    this.faxAttempt = fax;

    clan.then((c) => {
      if (c == null) {
        return;
      }

      this.faxAttempt.clanId = c.id;
      this.faxAttempt.clanName = c.name;
    });
  }

  notifyUpdate(message: FaxMessages) {
    let msg = message.replaceAll(`{monster}`, this.monster.name);
    msg = msg.replaceAll(`{operator}`, config.FAXBOT_OPERATOR);
    msg = msg.replaceAll(`{clan}`, this.faxAttempt?.clanName ?? `Unknown Clan`);

    this.client.sendPrivateMessage(this.player, msg);

    this.faxAttempt.outcome = message;
  }

  getClan(): Promise<KoLClan> {
    return this.targetClanPromise;
  }

  getFaxSource(): FaxClanData {
    const clan = getClanByMonster(this.monster);

    if (clan != null) {
      this.faxAttempt.faxClan = clan.clanId;
    }

    return clan;
  }

  getExpectedMonster(): string {
    return this.monster.name;
  }

  getRequester(): string {
    return this.player.name;
  }
}
