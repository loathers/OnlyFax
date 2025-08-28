import { config } from "../../config.js";
import type { KoLClient } from "../../utils/KoLClient.js";

export class FortuneTeller {
  private fortuneTeller: "UNTESTED" | "EXISTS" | "DOESNT EXIST" = `UNTESTED`;
  private client: KoLClient;

  constructor(client: KoLClient) {
    this.client = client;
  }

  async checkFortuneTeller() {
    if (
      this.fortuneTeller == `DOESNT EXIST` ||
      this.client.getCurrentClan() == null ||
      this.client.getCurrentClan().id != config.DEFAULT_CLAN
    ) {
      return;
    }

    let page: string = await this.client.visitUrl(`clan_viplounge.php`, {
      preaction: `lovetester`,
    });

    // Only set to true if we're explicitly denied entry
    if (
      this.fortuneTeller == null &&
      page.includes(`You attempt to sneak into the VIP Lounge`)
    ) {
      this.fortuneTeller = `DOESNT EXIST`;

      return;
    }

    page = await this.client.visitUrl(`choice.php`, {
      forceoption: `0`,
    });

    // Only set to false if we've explicitly seen the teller
    if (this.fortuneTeller == `UNTESTED` && page.includes(`Madame Zatara`)) {
      this.fortuneTeller = `EXISTS`;
    }

    const promises = [];

    for (const match of page.matchAll(
      /clan_viplounge\.php\?preaction=testlove&testlove=(\d+)/g,
    )) {
      const userId = match[1];

      const promise = this.client.visitUrl(`clan_viplounge.php`, {
        q1: `beer`,
        q2: `robin`,
        q3: `thin`,
        preaction: `dotestlove`,
        testlove: userId,
      });

      promises.push(promise);
    }

    // We do promises so we're not accidentally messing up something else
    await Promise.allSettled(promises);
  }
}
