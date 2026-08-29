import type { ParentController } from "../../ParentController.js";
import type { SettingType } from "../../types.js";
import { type KoLUser, SettingTypes } from "../../types.js";
import { invalidateReportCache } from "../../utils/reportCacheMiddleware.js";
import { removeSetting, setSetting } from "../managers/database.js";
import { createMonsterList } from "../monsters.js";
import type { FaxCommand } from "./FaxCommand.js";
import { decode } from "html-entities";

export class CommandSetting implements FaxCommand {
  controller: ParentController;

  constructor(controller: ParentController) {
    this.controller = controller;
  }

  isRestricted(): boolean {
    return true;
  }

  name(): string {
    return "setting";
  }

  description(): string {
    return "To set or remove a setting";
  }

  async execute(sender: KoLUser, parameters: string) {
    const match = decode(parameters).match(
      /^(\[\d+].+?) (\S+) (remove|set) ?(.+)?$/,
    );

    if (match == null) {
      await this.controller.client.sendPrivateMessage(
        sender,
        `Invalid parameter. Use the format "[123]MonsterXmlCommand <${SettingTypes.join(
          "/",
        )}> <set/remove> value?", where value is omitted if not needed`,
      );

      return;
    }

    let [, monster, settingName] = match;
    const [, , , action, value] = match;

    if (action == "set" && value == null) {
      await this.controller.client.sendPrivateMessage(sender, `Missing value!`);

      return;
    }

    settingName = SettingTypes.find(
      (t) => t.toLowerCase() == settingName.toLowerCase(),
    );

    if (!SettingTypes.includes(settingName as SettingType)) {
      await this.controller.client.sendPrivateMessage(
        sender,
        `Unknown setting, use one of ${SettingTypes.join(", ")}`,
      );

      return;
    }

    const monsters = createMonsterList(null);
    const mons = monsters.find(
      (m) => m.command.replaceAll(" ", "") == monster.replaceAll(" ", ""),
    );

    if (mons == null) {
      await this.controller.client.sendPrivateMessage(
        sender,
        `Unable to find a monster by the name '${monster}'`,
      );

      return;
    }

    monster = mons.command;

    invalidateReportCache();

    if (action == "remove") {
      const oldSetting = await removeSetting(sender, monster, settingName);

      if (oldSetting == null) {
        await this.controller.client.sendPrivateMessage(
          sender,
          `The setting was not in use. Nothing has changed.`,
        );
      } else {
        await this.controller.client.sendPrivateMessage(
          sender,
          `Setting ${settingName} with value '${oldSetting}' has been removed for: ${monster}`,
        );
      }

      return;
    }

    const oldSetting = await setSetting(sender, monster, settingName, value);

    if (oldSetting == null) {
      await this.controller.client.sendPrivateMessage(
        sender,
        `Setting ${settingName} has been set to '${value}' for: ${monster}`,
      );
    } else {
      await this.controller.client.sendPrivateMessage(
        sender,
        `Setting ${settingName} has been changed from '${oldSetting}' to '${value}' for: ${monster}`,
      );
    }
  }
}
