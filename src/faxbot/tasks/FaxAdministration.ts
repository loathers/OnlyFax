import { config } from "../../config.js";
import type { ParentController } from "../../ParentController.js";
import { addLog } from "../../Settings.js";
import type { DepositedFax, KoLClan } from "../../types.js";
import type { FaxRequest } from "../faxrequests/FaxRequest.js";
import { PlayerFaxRequest } from "../faxrequests/FaxRequest.js";
import {
  getClanById,
  getOutdatedClans,
  getUnknownClans,
  removeInaccessibleClans,
  updateClan,
} from "../managers/clans.js";

export class FaxAdministration {
  controller: ParentController;
  faxes: DepositedFax[] = []; // Automatically cleared 5m after insert
  lastAdministration: number = 0;

  constructor(controller: ParentController) {
    this.controller = controller;
  }

  getFaxRunner() {
    return this.controller.faxer;
  }

  getClient() {
    return this.controller.client;
  }

  async refreshClans(clans: KoLClan[]) {
    try {
      for (let i = 0; i < clans.length; i++) {
        await this.getFaxRunner().checkClanInfo(
          clans[i],
          clans.length > 1 ? `(${i + 1} / ${clans.length})` : null,
        );
      }
    } finally {
      await this.getFaxRunner().joinDefaultClan();
    }
  }

  async processWhitelists() {
    const whitelists = await this.getClient().getWhitelists();

    await removeInaccessibleClans(whitelists);
    const unknown = getUnknownClans(whitelists);

    if (unknown.length == 0) {
      return;
    }

    for (const preprocess of [config.DEFAULT_CLAN, config.FAX_DUMP_CLAN]) {
      const clan = getClanById(preprocess);

      if (clan != null) {
        continue;
      }

      const data = unknown.find((d) => d.id == preprocess);

      if (data == null) {
        throw `Expected a whitelist to the clan for ${preprocess} as defined in our settings`;
      }

      await this.getFaxRunner().checkClanInfo(data);
    }

    if (config.TESTING) {
      return;
    }

    try {
      for (const clan of unknown) {
        await this.getFaxRunner().checkClanInfo(clan);
      }
    } finally {
      await this.getFaxRunner().joinDefaultClan();
    }
  }

  async runAdministration() {
    // If we've processed a request in the last 10min
    if (
      this.faxes.length > 0 &&
      this.faxes[this.faxes.length - 1].requested + 10 * 60 > Date.now() / 1000
    ) {
      return;
    }

    // If we already ran this in the last 2 hours
    if (this.lastAdministration + 60 * 60 * 120 > Date.now() / 1000) {
      return;
    }

    const outdated = getOutdatedClans();

    if (outdated.length > 0) {
      const clan = outdated[0];

      try {
        await this.controller.faxer.checkClanInfo({
          id: clan.clanId,
          name: clan.clanName,
        });
      } catch (e) {
        addLog(`Errored while checking ${clan.clanName}: ${e}`);

        // As we errored, just set it to have been checked and we'll skip it
        clan.clanLastChecked = Math.round(Date.now() / 1000);
        await updateClan(clan);
      }
    }

    // We only process one at the time before leaving, so we don't hold up any faxes
    if (outdated.length > 1) {
      return;
    } else if (outdated.length > 0) {
      // Join the default clan
      await this.controller.faxer.joinDefaultClan();
    }

    // Check fortune teller
    await this.controller.fortune.checkFortuneTeller();
    this.lastAdministration = Date.now() / 1000;
  }

  pruneFaxes() {
    // Prune all entries more than 30min old
    while (
      this.faxes.length > 0 &&
      this.faxes[0].completed + 5 * 60 < Date.now() / 1000
    ) {
      this.faxes.shift();
    }
  }

  async ensureClanTimeout(newFax: FaxRequest): Promise<void> {
    if (!(newFax instanceof PlayerFaxRequest)) {
      return;
    }

    const faxData = newFax.faxAttempt;

    if (faxData == null) {
      return;
    }

    if (newFax.targetClan == null) {
      return;
    }

    const now = Math.round(Date.now() / 1000);

    for (const fax of this.faxes) {
      if (fax.clanId != newFax.targetClan.id) {
        continue;
      }

      // No delay if its the same player
      if (fax.requester.id == newFax.player.id) {
        return;
      }

      // Its the same monster, no wait
      if (fax.fax.id == faxData.fax.id) {
        return;
      }

      const completed = (fax.completed ?? fax.requested) + 10;
      const delay = completed - now;

      // If the last fax has already elapsed, don't worry about it
      if (delay <= 0) {
        return;
      }

      console.log(`Waiting for ${delay} seconds before completing fax request`);

      // Wait for {delay} seconds before finishing
      await new Promise((res) => setTimeout(res, delay * 1000));
      break;
    }
  }
}
