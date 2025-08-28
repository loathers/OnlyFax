import { config } from "../config.js";
import { getClanDataById, getClanType } from "../faxbot/managers/clans.js";
import { addLog } from "../Settings.js";
import type {
  ClanJoinAttempt,
  CombatMacro,
  FaxMachine,
  KoLClan,
  KOLCredentials,
  KoLEffect,
  KOLMessage,
  KoLStatus,
  KoLUser,
  PhotoInfo,
  UserClan,
  UserInfo,
} from "../types.js";
import { getSecondsToNearestRollover, splitMessage } from "./utilities.js";
import { Mutex } from "async-mutex";
import type { AxiosResponse } from "axios";
import { isAxiosError } from "axios";
import axios from "axios";
import { readFileSync } from "fs";

export class KoLClient {
  private _loginParameters: URLSearchParams;
  private _credentials?: KOLCredentials;
  private _player?: KoLUser;
  private _isLoggedOut: boolean = true;
  private mutex = new Mutex();
  private currentClan: UserClan;
  private _lastFetchedMessages: string = `0`;
  private stuckInFight: boolean = false;
  private lastStatus: KoLStatus;

  constructor(username: string, password: string) {
    this._player = { name: username, id: `` };

    this._loginParameters = new URLSearchParams();
    this._loginParameters.append(`loggingin`, `Yup.`);
    this._loginParameters.append(`loginname`, username);
    this._loginParameters.append(`password`, password);
    this._loginParameters.append(`secure`, `0`);
    this._loginParameters.append(`submitbutton`, `Log In`);
  }

  getLastStatus(): KoLStatus {
    return this.lastStatus;
  }

  isRolloverRisk(minutes: number) {
    // We do not allow the faxbot to run X min within the rollover date
    const secondsToRollover = getSecondsToNearestRollover();
    const minSecondsAllowed = minutes * 60;

    return secondsToRollover <= minSecondsAllowed;
  }

  setLoggedOut() {
    this._isLoggedOut = true;
    this._credentials = undefined;
    this.currentClan = undefined;
  }

  isStuckInFight() {
    return this.stuckInFight;
  }

  getUsername() {
    return this._player?.name;
  }

  getUserID() {
    return this._player?.id;
  }

  async getKmails(): Promise<string> {
    if (this.isLoggedOut() || this.isRolloverRisk(15)) {
      return "{}";
    }

    return await this.visitUrl(`api.php`, { what: "kmail", for: "Faxbot" });
  }

  async relog() {
    this.setLoggedOut();

    return this.logIn();
  }

  getMonster(page: string): number {
    const match = page.match(/<!-- MONSTERID: (\d+) -->/);

    if (match == null) {
      return null;
    }

    return parseInt(match[1]);
  }

  isFightPage(page: string): boolean {
    return page.includes(` action=fight.php method=post>`);
  }

  async fetchNewMessages(): Promise<KOLMessage[]> {
    try {
      const newChatMessagesResponse = await this.visitUrl(
        `newchatmessages.php`,
        {
          j: 1,
          lasttime: this._lastFetchedMessages,
        },
      );

      if (!newChatMessagesResponse) {
        return [];
      }

      this._lastFetchedMessages = newChatMessagesResponse[`last`];

      return newChatMessagesResponse[`msgs`] as KOLMessage[];
    } catch (e) {
      addLog(
        `Errored when trying to pull messages for ` + this.getUsername(),
        e,
      );
    }

    return [];
  }

  async loggedIn(): Promise<boolean> {
    if (!this._credentials || this._isLoggedOut) {
      return false;
    }

    try {
      const apiResponse = await axios(
        `https://www.kingdomofloathing.com/api.php`,
        {
          maxRedirects: 0,
          withCredentials: true,
          headers: {
            cookie: this._credentials?.sessionCookies || ``,
          },
          params: {
            what: `status`,
            for: `FaxBot`,
          },
        },
      );

      this._isLoggedOut = !(
        apiResponse &&
        apiResponse.data &&
        apiResponse.data[`name`]
      );

      return !this.isLoggedOut();
    } catch (e) {
      this._isLoggedOut = true;

      addLog(`Login check failed, returning false to be safe.`, e);

      return false;
    }
  }

  async getInventory(): Promise<Map<number, number>> {
    const apiResponse = await this.visitUrl(`api.php`, {
      what: `inventory`,
      for: `me`,
    });

    const map: Map<number, number> = new Map();

    if (!apiResponse) {
      return map;
    }

    for (const [key, value] of Object.entries(apiResponse)) {
      if (
        typeof value != `string` ||
        !/^\d+$/.test(key) ||
        !/^\d+$/.test(value)
      ) {
        continue;
      }

      map.set(parseInt(key), parseInt(value));
    }

    return map;
  }

  async sendKmail(
    target: number,
    message: string,
    meat: number = 0,
    items: [number, number][] = [],
  ) {
    let currentItem: number = 1;
    const args = {
      action: `send`,
      towho: target.toString(),
      message: message,
      savecopy: `on`,
      sendmeat: meat > 0 ? meat.toString() : ``,
    };

    for (const [item, count] of items) {
      args[`howmany` + currentItem] = count.toString();
      args[`whichitem` + currentItem] = item.toString();
      currentItem++;
    }

    await this.visitUrl(`sendmessage.php`, args);
  }

  async getStatus(): Promise<KoLStatus> {
    const apiResponse = await this.visitUrl(`api.php`, {
      what: `status`,
      for: `FaxBot`,
    });

    if (!apiResponse || !apiResponse[`equipment`]) {
      throw `Error fetching api on ` + this.getUsername() + `:` + apiResponse;
    }

    this._credentials.pwdhash = apiResponse[`pwd`];

    this._player = {
      id: apiResponse[`playerid`],
      name: apiResponse[`name`],
    };

    const equipment = new Map();
    const equips = apiResponse[`equipment`];
    const effects: KoLEffect[] = [];

    for (const [key, value] of Object.entries(equips)) {
      if (
        typeof value != `string` ||
        !/^\d+$/.test(key) ||
        !/^\d+$/.test(value)
      ) {
        continue;
      }

      equipment.set(key, parseInt(value));
    }

    if (apiResponse[`effects`]) {
      for (const apiEffect of Object.values(apiResponse[`effects`])) {
        // description-UUID [Name, Duration, Shorthand ID, source, Effect ID]
        const effect: KoLEffect = {
          name: apiEffect[0],
          duration: parseInt(apiEffect[1]),
          id: parseInt(apiEffect[4]),
        };

        if (effect.duration <= 0) {
          continue;
        }

        effects.push(effect);
      }
    }

    const status = {
      fetched: Date.now(),
      name: apiResponse[`name`],
      playerid: apiResponse[`playerid`],
      level: parseInt(apiResponse[`level`]) || 1,
      adventures: parseInt(apiResponse[`adventures`] ?? `10`),
      meat: parseInt(apiResponse[`meat`]) || 0,
      drunk: parseInt(apiResponse[`drunk`]) || 0,
      full: parseInt(apiResponse[`full`]) || 0,
      spleen: parseInt(apiResponse[`spleen`]) || 0,
      hp: parseInt(apiResponse[`hp`]) || 0,
      mp: parseInt(apiResponse[`mp`]) || 0,
      maxHP: parseInt(apiResponse[`maxhp`]) || 0,
      maxMP: parseInt(apiResponse[`maxmp`]) || 0,
      familiar: apiResponse[`familiar`]
        ? parseInt(apiResponse[`familiar`])
        : undefined,
      equipment: equipment,
      rollover: parseInt(apiResponse[`rollover`]),
      turnsPlayed: parseInt(apiResponse[`turnsplayed`]) || 0,
      effects: effects,
      daynumber: parseInt(apiResponse[`daynumber`]) || 0,
    };

    this.lastStatus = status;

    return status;
  }

  async logIn(): Promise<boolean> {
    await this.mutex.acquire();

    try {
      if (await this.loggedIn()) {
        return true;
      }

      this._credentials = undefined;

      addLog(
        `Not logged in. Logging in as ${this._loginParameters.get(`loginname`)}`,
      );

      try {
        const loginResponse = await axios.post(
          `https://www.kingdomofloathing.com/login.php`,
          this._loginParameters,
          {
            data: this._loginParameters,
            maxRedirects: 0,
            validateStatus: (status) => status === 302,
          },
        );

        if (!loginResponse.headers[`set-cookie`]) {
          addLog(`Login failed.. Headers missing`);

          return false;
        }

        const sessionCookies = loginResponse.headers[`set-cookie`]
          .map((cookie: string) => cookie.split(`;`)[0])
          .join(`; `);
        this._credentials = { sessionCookies: sessionCookies, pwdhash: null };
        await this.getStatus();

        addLog(
          `Login Success. Logged in as ${this._player.name} (#${this._player.id})`,
        );
        this._isLoggedOut = false;
        const fightPage = await this.visitUrl(`fight.php`);

        this.stuckInFight = this.isFightPage(fightPage);

        await this.visitUrl(`mchat.php`);

        return true;
      } catch (e) {
        addLog(`Login failed.. Got an error.`, e);
        this._isLoggedOut = true;

        return false;
      }
    } finally {
      this.mutex.release();
    }
  }

  async visitUrl(
    url: string,
    parameters: Record<string, string | number> = {},
    method: "GET" | "POST" = `POST`,
  ): Promise<string> {
    const params = new URLSearchParams({
      ...(this._credentials?.pwdhash
        ? { pwd: this._credentials?.pwdhash }
        : {}),
      ...parameters,
    });

    try {
      let page: AxiosResponse;

      if (method == `POST`) {
        page = await axios.post(
          `https://www.kingdomofloathing.com/${url}`,
          params,
          {
            withCredentials: true,
            headers: {
              cookie: this._credentials?.sessionCookies || ``,
            },
            data: params,
            validateStatus: (status) => status === 200,
          },
        );
      } else {
        page = await axios.get(`https://www.kingdomofloathing.com/${url}`, {
          withCredentials: true,
          headers: {
            cookie: this._credentials?.sessionCookies || ``,
          },
          data: params,
          validateStatus: (status) => status === 200,
        });
      }

      if (page.request && page.request.res && page.request.res.responseUrl) {
        const currentUrl = page.request.res.responseUrl as string;

        if (
          currentUrl.startsWith("https://www.kingdomofloathing.com/login.php")
        ) {
          addLog(`We appear to be logged out..`);
          this.setLoggedOut();
        }
      }

      if (page.headers[`set-cookie`] && this._credentials != null) {
        const cookies: Record<string, string> = {};

        for (const [name, cookie] of this._credentials.sessionCookies
          .split(`; `)
          .map((s) => s.split(`=`))) {
          if (!cookie) {
            continue;
          }

          cookies[name] = cookie;
        }

        const sessionCookies = page.headers[`set-cookie`].map(
          (cookie: string) => cookie.split(`;`)[0].trim().split(`=`),
        );

        for (const [name, cookie] of sessionCookies) {
          cookies[name] = cookie;
        }

        this._credentials.sessionCookies = Object.entries(cookies)
          .map(([key, value]) => `${key}=${value as string}`)
          .join(`; `);
      }

      return page.data;
    } catch (e) {
      if (isAxiosError(e)) {
        console.error(
          `Experienced error when visiting '${url}', ${e.status}: ${
            e.response?.data ?? e.response
          }`,
          e,
        );

        return null;
      } else {
        throw e;
      }
    }
  }

  isLoggedOut(): boolean {
    return this._isLoggedOut;
  }

  async getClanInfo(playerId: number): Promise<UserClan | undefined> {
    const user = await this.getUserInfo(playerId);

    if (user == null) {
      return null;
    }

    return user.clan;
  }

  /**
   * Can return undefined when in valhalla, can have nullsy clan
   */
  async getUserInfo(playerId: number): Promise<UserInfo | undefined> {
    if (playerId == -1) {
      playerId = parseInt(this.getUserID());
    }

    const myClanResponse = await this.visitUrl(`showplayer.php`, {
      who: playerId,
    });

    const clanMatch = myClanResponse.match(
      /<b><a class=nounder href="showclan\.php\?whichclan=(\d+)">(.*?)<\/a><\/b>(?:<br>Title: <b>([^>]*)<\/b><\/td>)?/,
    );

    const userMatch = myClanResponse.match(/<b>([^>]*?)<\/b> \(#(\d+)\)<br>/);

    if (userMatch == null) {
      return undefined;
    }

    const user: UserInfo = {
      name: userMatch[1],
      id: parseInt(userMatch[2]),
    };

    if (clanMatch != null) {
      user.clan = {
        id: parseInt(clanMatch[1]),
        name: clanMatch[2],
        title: clanMatch[3],
      };
    }

    return user;
  }

  async useFaxMachine(
    action: "sendfax" | "receivefax",
    bypassSource: boolean = false,
  ): Promise<FaxMachine> {
    if (action != `receivefax` && !bypassSource) {
      if (this.currentClan == null) {
        return `No Clan Info`;
      }

      const clan = getClanDataById(this.currentClan.id);

      if (clan == null || getClanType(clan) == `Fax Source`) {
        return `Illegal Clan`;
      }
    }

    const result = await this.visitUrl(`clan_viplounge.php`, {
      preaction: action,
      whichfloor: `2`,
    });

    if (
      result.includes(`You pop your photocopy into the tray, dial the number`)
    ) {
      return `Sent Fax`;
    }

    if (result.includes(`You get the jam cleared and hit a bunch of buttons`)) {
      return `Grabbed Fax`;
    }

    if (
      result.includes(
        `You sit for a while waiting for an important fax, but one doesn't show up`,
      )
    ) {
      return `Already have fax`;
    }

    if (
      result.includes(
        `It turns out to just be a blank sheet of paper, so you throw it away`,
      ) ||
      result.includes(
        `The stupid broken fax machine just spits out another blank sheet of paper.`,
      ) // Monster that used to be faxable but now isn't, eg, embezzler
    ) {
      return `No Fax Loaded`;
    }

    if (
      result.includes(`>Clan VIP Lounge (Attic)</b>`) &&
      !result.includes(
        `<a href=clan_viplounge.php?action=faxmachine&whichfloor=2>`,
      )
    ) {
      return `No Fax Machine`;
    }

    if (result.includes(`That's not a thing.`)) {
      return `Have no fax to send`;
    }

    addLog(`Error: Can't process fax result: ${result}`);

    return `Unknown`;
  }

  async getPhotoInfo(): Promise<PhotoInfo> {
    const item = await this.visitUrl(`desc_item.php?whichitem=835898159`);

    const match = item.match(
      /likeness of (?:a|an) (.*?)<!-- monsterid: (\d+) --> on it/,
    );

    if (match == null) {
      return null;
    }

    if (match[1] == "butt") {
      match[1] = "somebody else's butt";
    }

    // KoL bug has it always reported as ID of 1
    if (match[1] == "somebody else's butt") {
      match[2] = "1049";
    }

    return {
      name: match[1],
      id: parseInt(match[2]),
    };
  }

  async start() {
    addLog(`Starting ` + this.getUsername() + `...`);

    while (this.isLoggedOut()) {
      await this.logIn();

      // If still logged out, wait 5 seconds before trying to login again
      if (this.isLoggedOut()) {
        await new Promise((res) => setTimeout(res, 5000));
      }
    }
  }

  async useChatMacro(macro: string): Promise<string> {
    return await this.visitUrl(`submitnewchat.php`, {
      graf: `/clan ${macro}`,
      j: 1,
    });
  }

  async sendPrivateMessage(recipient: KoLUser, message: string): Promise<void> {
    if (recipient.id == "-1" || config.TESTING) {
      addLog(`\x1b[35mFaxbot > Console: \x1b[0m${message}`);

      return;
    }

    for (const msg of splitMessage(message)) {
      await this.useChatMacro(`/w ${recipient.id} ${msg}`);
    }
  }

  async getClanLeader(clanId: string): Promise<number | undefined> {
    const page = await this.visitUrl(`showclan.php`, { whichclan: clanId });

    if (!page) {
      return undefined;
    }

    const match = page.match(
      />Leader:<\/td><td valign=top><b><a href="showplayer\.php\?who=(\d+)">/,
    );

    if (!match) {
      return undefined;
    }

    return parseInt(match[1]);
  }

  async getNewLeader(): Promise<KoLUser> {
    const members = await this.visitUrl(`clan_members.php`);

    if (!members) {
      return undefined;
    }

    let backup: KoLUser;

    for (const match of members.matchAll(
      /href="showplayer\.php\?who=(\d+)">([^<]+?)<\/a>(?:<font color=gray><b> \((inactive)\)<\/b>)?/gm,
    )) {
      if (this.getUserID() == match[1]) {
        continue;
      }

      const user: KoLUser = { id: match[1], name: match[2] };

      // If they are not inactive
      if (match[3] == null) {
        // Set the backup user
        if (backup == null) {
          backup = user;
        }

        // continue, we'll never prioritize an active over inactive
        continue;
      }

      // They are inactive, return
      return user;
    }

    return backup;
  }

  async transferClanLeadership(newLeader: KoLUser): Promise<boolean> {
    addLog(
      `Now transfering leadership of ${(await this.myClan()).name} to ${
        newLeader.name
      } (#${newLeader.id})`,
    );
    const response = await this.visitUrl(`clan_admin.php`, {
      action: `changeleader`,
      newleader: newLeader.id,
      confirm: `on`,
    });

    return /Leadership of clan transferred. A leader is no longer you./.test(
      response,
    );
  }

  async getWhitelists(): Promise<KoLClan[]> {
    const clanRecuiterResponse = await this.visitUrl(
      `clan_signup.php?place=managewhitelists`,
    );

    if (!clanRecuiterResponse) {
      return [];
    }

    const clans: KoLClan[] = [];

    for (const [, clanId, clanName] of clanRecuiterResponse.matchAll(
      /<a href=showclan\.php\?whichclan=(\d+) class=nounder><b>([^>]*?)<\/b>(?=.*>Apply to a Clan<\/b><\/td><\/tr>)/gm,
    )) {
      clans.push({
        id: parseInt(clanId),
        name: clanName,
      });
    }

    return clans;
  }

  async myClan(): Promise<UserClan | undefined> {
    const info = await this.getUserInfo(parseInt(this.getUserID()));

    if (info == null) {
      return undefined;
    }

    this.currentClan = info.clan;

    return this.currentClan;
  }

  async joinClanForcibly(
    clan: UserClan,
    goal: string,
  ): Promise<ClanJoinAttempt> {
    let res = await this.joinClan(clan, goal);

    if (res == `Am Clan Leader`) {
      const newLeader = await this.getNewLeader();

      if (newLeader == null) {
        addLog(
          `Failed to find a new clan leader for ${(await this.myClan()).name}`,
        );

        // TODO Disband clan possibly
        return res;
      }

      await this.transferClanLeadership(newLeader);
      res = await this.joinClan(clan, goal);
    }

    return res;
  }

  async joinClan(clan: UserClan, goal: string): Promise<ClanJoinAttempt> {
    const page = await this.visitUrl(`showclan.php`, {
      whichclan: clan.id,
      action: `joinclan`,
      confirm: `1`,
      ajax: 0,
      _: Date.now(),
    });

    let joinResult = page;
    const div = page.indexOf(`</center></td>`);

    if (div > 0) {
      joinResult = page.substring(0, div);
    }

    if (
      joinResult.includes(
        `You can't apply to a new clan when you're the leader of an existing clan.`,
      )
    ) {
      return `Am Clan Leader`;
    }

    if (
      joinResult.includes("This clan is not accepting admissions right now.") ||
      joinResult.includes(`You have submitted a request to join`)
    ) {
      return `Not Whitelisted`;
    }

    if (
      joinResult.includes(`You have now changed your allegiance.`) ||
      joinResult.includes(`You can't apply to a clan you're already in.`)
    ) {
      this.currentClan = clan;
      addLog(`Now in clan ${clan.name} to: ${goal}`);

      return `Joined`;
    }

    const clanMatch = page.match(/>Clan Hall<\/b>.+?<b>(.+?)<\/b>/);

    // Backup!
    if (clanMatch != null && clanMatch[1] === clan.name) {
      this.currentClan = clan;
      addLog(`Now in clan ${clan.name} to: ${goal}`);

      return `Joined`;
    }

    // The fallback when there was an unexpected error, such as not being in a clan. As it doesn't give us a proper message
    const myClan = await this.myClan();

    if (myClan != null) {
      addLog(`Now in clan ${myClan.name} to: ${goal}`);

      if (myClan.id == clan.id) {
        this.currentClan = myClan;

        return `Joined`;
      }
    }

    addLog(`Error: Can't process clan switch: ${page}`);

    return `Unknown`;
  }

  getCurrentClan() {
    return this.currentClan;
  }

  async startFaxFight(): Promise<number | undefined> {
    let page = await this.visitUrl(`inv_use.php`, {
      whichitem: 4873,
      ajax: 1,
    });

    // Redirect follow? Should ask us to fetch fight.php
    this.stuckInFight = this.isFightPage(page);

    if (!this.stuckInFight) {
      // Do this just incase
      addLog(`Not in fight apparently, now visiting fight.php to make sure..`);
      this.stuckInFight = this.isFightPage(
        (page = await this.visitUrl(`fight.php`)),
      );
      addLog(`The outcome of that was, stuck in fight: ${this.stuckInFight}`);
    }

    if (!this.stuckInFight) {
      return null;
    }

    return this.getMonster(page);
  }

  async getCombatMacros(): Promise<CombatMacro[]> {
    const apiResponse = await this.visitUrl(`account_combatmacros.php`);

    if (!apiResponse) {
      return [];
    }

    const macros: CombatMacro[] = [];

    const match = apiResponse.matchAll(
      /<option value="(\d+)">(.*?)<\/option>/g,
    );

    for (const [, id, name] of match) {
      macros.push({ id: id, name: name });
    }

    return macros;
  }

  async runCombatMacro(macro: string) {
    return this.visitUrl(`fight.php`, {
      action: `macro`,
      macrotext: encodeURIComponent(macro),
    });
  }

  async tryToEscapeFight(reason: string) {
    addLog(
      `Something must have gone wrong, we're trying to escape the fight with reason: ${reason}`,
    );
    const macro = readFileSync(`./data/macros/EscapeFromFight.txt`, `utf-8`);

    return this.runCombatMacro(macro);
  }
}
