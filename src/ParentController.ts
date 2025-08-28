import { config } from "./config.js";
import { FaxOperations } from "./faxbot/FaxOperations.js";
import {
  getClanById,
  isUnknownMonsterInClanData,
  loadClans,
} from "./faxbot/managers/clans.js";
import { loadMonsters, tryUpdateMonsters } from "./faxbot/monsters.js";
import { FaxAdministration } from "./faxbot/tasks/FaxAdministration.js";
import { FortuneTeller } from "./faxbot/tasks/FortuneTeller.js";
import { MessageHandler } from "./faxbot/tasks/MessageHandler.js";
import { addLog } from "./Settings.js";
import { KoLClient } from "./utils/KoLClient.js";
import {
  getKolDay,
  getSecondsElapsedInDay,
  getSecondsToRollover,
} from "./utils/utilities.js";

export class ParentController {
  fortune: FortuneTeller;
  faxer: FaxOperations;
  client: KoLClient;
  admin: FaxAdministration;
  lastSeenDay: number = 0;
  messages: MessageHandler;
  increments: number = 0;
  started: number = Date.now();

  async startController() {
    await loadMonsters();
    await loadClans();

    this.client = new KoLClient(config.FAXBOT_USERNAME, config.FAXBOT_PASSWORD);

    await this.client.start();

    this.admin = new FaxAdministration(this);
    this.faxer = new FaxOperations(this);
    this.fortune = new FortuneTeller(this.client);
    this.messages = new MessageHandler(this);
  }

  shouldRestart(): boolean {
    // 12 hours
    return this.started + 12 * 60 * 60 * 1000 < Date.now();
  }

  async startBotHeartbeat() {
    while (true) {
      this.increments = ++this.increments % 100;

      // Start a timeout so that we won't wait a full 3 seconds before doing the next loop
      const timeout = new Promise((res) => setTimeout(res, 3000));

      // Run the heartbeat
      await this.onHeartbeat(this.increments);

      // Wait for the timeout
      await timeout;
    }
  }

  async onHeartbeat(increments: number) {
    // If RO in 10 seconds or if rollover less than 5min ago
    if (getSecondsToRollover() < 10 || getSecondsElapsedInDay() < 60 * 5) {
      this.client.setLoggedOut();

      return;
    }

    // If currently logged out
    if (this.client.isLoggedOut()) {
      // Don't try login every 3 seconds, but 30 seconds
      if (increments % 10 != 0) {
        return;
      }

      // Try to login
      await this.client.logIn();

      // If login failed, return
      if (this.client.isLoggedOut()) {
        return;
      }
    }

    // If new day, run new day code
    if (this.lastSeenDay != getKolDay()) {
      await this.onNewDay();

      return;
    }

    if (
      getSecondsToRollover() > 120 &&
      getSecondsToRollover() < 180 &&
      this.shouldRestart()
    ) {
      addLog(
        `FaxBot has been up for more than 12 hours, restarting to try avoid any potential memory leak. Between 2-3 minutes until RO..`,
      );
      process.exit(0);
    }

    await this.messages.pollMessages();
  }

  async onNewDay() {
    // If we've loaded our clans before
    if (getClanById(config.DEFAULT_CLAN) != null) {
      // If we don't know what our current clan is, fetch it
      if (this.client.getCurrentClan() == null) {
        await this.client.myClan();
      }

      // We are not in a clan, or are not in the normal clan. Join the default clan
      if (
        this.client.getCurrentClan() == null ||
        this.client.getCurrentClan().id != config.DEFAULT_CLAN
      ) {
        await this.faxer.joinDefaultClan();
      }
    }

    // Check out our whitelists
    await this.admin.processWhitelists();
    // Check fortune teller
    await this.fortune.checkFortuneTeller();

    // If unknown clan, update clan data as mafia might've updated by now
    if (isUnknownMonsterInClanData()) {
      await tryUpdateMonsters();
    }

    // Update the day we've last seen
    this.lastSeenDay = getKolDay();
    addLog(`Finished running new day..`);
  }

  checkSettings(): boolean {
    let issues = false;

    if ((config.FAXBOT_OPERATOR ?? ``).length < 3) {
      issues = true;
      addLog(
        `Error! Bot Operator in settings hasn't been configured properly!`,
      );
    }

    if (!(config.FAXBOT_USERNAME ?? ``).match(/^[a-zA-Z][\da-zA-Z _]{2,}$/)) {
      issues = true;
      addLog(`Error! Username hasn't been configured properly!`);
    }

    if (
      (config.FAXBOT_PASSWORD ?? ``).length < 6 ||
      config.FAXBOT_USERNAME == config.FAXBOT_PASSWORD
    ) {
      issues = true;
      addLog(
        `Error! Password hasn't been configured properly or is incredibly insecure!`,
      );
    }

    if (!/^[\d,]+$/.test(config.BOT_CONTROLLERS ?? ``)) {
      issues = true;
      addLog(`Error! allowedRefreshers hasn't been configured!`);
    }

    return issues;
  }
}
