import { config } from "../../config.js";
import type { ParentController } from "../../ParentController.js";
import { addLog } from "../../Settings.js";
import type { KOLMessage, KoLUser } from "../../types.js";
import type { KoLClient } from "../../utils/KoLClient.js";
import { FaxMessages } from "../../utils/messages.js";
import { CommandAddMonster } from "../commands/CommandAddMonster.js";
import { CommandHelp } from "../commands/CommandHelp.js";
import { CommandRefresh } from "../commands/CommandRefresh.js";
import { CommandSetting } from "../commands/CommandSetting.js";
import type { FaxCommand } from "../commands/FaxCommand.js";
import type { FaxAdministration } from "./FaxAdministration.js";

type MessageHandled = {
  player: string;
  time: number;
  warned: number;
};

type SpamState = "Pass" | "Warn & Fail" | "Fail";
const SPAM_TIMER = 3000;
const WARNED_TIMER = 5000;

class SpamHandler {
  lastHandled: MessageHandled[] = [];
  client: KoLClient;

  constructor(client: KoLClient) {
    this.client = client;
  }

  updateTime(player: KoLUser) {
    // Check if they have an entry
    const handle = this.lastHandled.find((h) => h.player == player.id);

    if (handle == null) {
      return;
    }

    handle.time = Date.now();
  }

  getSpamState(player: KoLUser): SpamState {
    // Check if they have an entry
    let handle = this.lastHandled.find((h) => h.player == player.id);

    // If they have an entry but it's no longer valid
    if (handle != null && this.isExpired(handle)) {
      // Remove from array
      this.lastHandled.splice(this.lastHandled.indexOf(handle), 1);
      // Set variable to null
      handle = null;
    }

    // No entry, add them. Don't skip their message
    if (handle == null) {
      this.lastHandled.push({
        player: player.id,
        time: Date.now(),
        warned: 0,
      });

      return "Pass";
    }

    // Update their last message time
    handle.time = Date.now();

    // If this is a new message, and they haven't been warned in the last 5 seconds
    if (handle.warned + WARNED_TIMER < Date.now()) {
      // They were warned
      handle.warned = Date.now();

      return "Warn & Fail";
    }

    // They were already warned, so fail them
    return "Fail";
  }

  isExpired(handle: MessageHandled): boolean {
    return handle.time + SPAM_TIMER < Date.now();
  }

  clean() {
    for (let i = 0; i < this.lastHandled.length; i++) {
      const handle = this.lastHandled[i];

      if (!this.isExpired(handle)) {
        continue;
      }

      this.lastHandled.splice(i, 1);
      // Decrement the counter as the array length has changed
      i--;
    }
  }
}

export class MessageHandler {
  controller: ParentController;
  admin: FaxAdministration;
  lastKeepAlive: number = 0;
  commands: FaxCommand[] = [];
  admins: string[];
  spamCheck: SpamHandler;

  constructor(controller: ParentController) {
    this.controller = controller;
    this.admin = controller.admin;
    this.admins = config.BOT_CONTROLLERS.split(`,`);
    this.spamCheck = new SpamHandler(controller.client);

    this.registerCommands();
  }

  registerCommands() {
    this.commands.push(new CommandHelp(this.controller));
    this.commands.push(new CommandRefresh(this.controller));
    this.commands.push(new CommandAddMonster(this.controller));
    this.commands.push(new CommandSetting(this.controller));
  }

  getFaxRunner() {
    return this.controller.faxer;
  }

  getClient() {
    return this.controller.client;
  }

  async pollMessages() {
    if (this.lastKeepAlive + 30_000 < Date.now()) {
      this.lastKeepAlive = Date.now();
      // Nonsense command that forces kol to consider us as online due to it "timing out" every minute
      await this.getClient().useChatMacro(`/keepalive`);
    }

    const messages = await this.getClient().fetchNewMessages();

    if (messages.length == 0) {
      await this.admin.runAdministration();

      return;
    }

    let lastPolled = Date.now();
    this.spamCheck.clean();

    // While there are messages to process
    while (messages.length > 0) {
      // First in, first out
      const msg = messages.shift();

      // Always ignore self
      if (msg.who != null && msg.who.id == this.getClient().getUserID()) {
        continue;
      }

      // If this is a private message and is spamming the bot
      if (this.isPrivateMessage(msg)) {
        const state = this.spamCheck.getSpamState(msg.who);

        if (state == "Warn & Fail") {
          await this.getClient().sendPrivateMessage(
            msg.who,
            "Please don't spam me with requests! Wait before messaging me again."
          );
        }

        if (state != "Pass") {
          continue;
        }
      }

      // Process message
      await this.processMessage(msg);

      if (this.isPrivateMessage(msg)) {
        // This is to update their last message time, so slower requests still warn
        this.spamCheck.updateTime(msg.who);
      }

      // If this has taken more than 2 seconds since last poll, then fetch more messages instead of a 3 second wait
      if (lastPolled + 2000 < Date.now()) {
        // Update messages with any new messages
        messages.push(...(await this.getClient().fetchNewMessages()));
        lastPolled = Date.now();
      }
    }
  }

  isPrivateMessage(message: KOLMessage): boolean {
    return (
      message.msg != null &&
      message.who != null &&
      message.who.id != null &&
      message.type == `private`
    );
  }

  async processMessage(message: KOLMessage) {
    this.admin.pruneFaxes();

    if (this.getClient().isRolloverRisk(3)) {
      if (this.isPrivateMessage(message)) {
        await this.getClient().sendPrivateMessage(
          message.who,
          FaxMessages.ERROR_TOO_CLOSE_ROLLOVER
        );
      }

      return;
    }

    if (message.type == `event`) {
      if (message.msg?.includes(`href='clan_viplounge.php?preaction`)) {
        await this.controller.fortune.checkFortuneTeller();

        return;
      }

      await this.admin.processWhitelists();

      return;
    } else if (!this.isPrivateMessage(message)) {
      return;
    }

    if (/^-?\d+$/.test(message.who.id)) {
      const name = message.msg.split(` `)[0].toLowerCase();

      const command = this.commands.find((c) => c.name() == name);
      const admin = this.admins.includes(message.who.id);

      if (command != null && (!command.isRestricted() || admin)) {
        addLog(
          `Now handling command '${message.msg}' for ${message.who.name} (#${message.who.id})`
        );
        await command.execute(
          message.who,
          message.msg.substring(name.length).trim(),
          admin
        );

        return;
      }
    }

    await this.getFaxRunner().handleFaxRequestWrapper(message.who, message.msg);
  }
}
