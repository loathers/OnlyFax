import { config } from "./config.js";
import { formatMonsterList, generateLookingFor } from "./faxbot/monsters.js";
import { ParentController } from "./ParentController.js";
import { addLog } from "./Settings.js";
import type { KOLMessage } from "./types.js";
import { cacheReports } from "./utils/reportCacheMiddleware.js";
import { App } from "@tinyhttp/app";
import { createInterface } from "readline";

const controller = new ParentController();
await controller.startController();

const username = controller.client.getUsername();
const userId = controller.client.getUserID();

const app = new App();

app
  // Since every endpoint is a report, for the moment this middleware is just set up
  // to cache every endpoint.
  .use(cacheReports(["/", "/onlyfax.xml", "/onlyfax.json", "lookingfor.json"]))
  .get("/", async (_, res) => {
    const html = await formatMonsterList("html", username, userId);
    void res.type("html").send(html);
  })
  .get(
    "/onlyfax.xml",
    async (_, res) =>
      void res
        .type("xml")
        .send(await formatMonsterList("xml", username, userId)),
  )
  .get(
    "/onlyfax.json",
    async (_, res) =>
      void res
        .type("json")
        .send(await formatMonsterList("json", username, userId)),
  )
  .get(
    "/lookingfor.json",
    (_, res) => void res.type("json").send(generateLookingFor()),
  )
  .listen(3000);

if (config.TESTING) {
  const messages: KOLMessage[] = [];

  controller.client.fetchNewMessages = () => {
    const newMessages = messages.splice(0);

    return new Promise((res) => res(newMessages));
  };

  const rl = createInterface({
    input: process.stdin,
  });

  rl.on("line", (line) => {
    addLog(`\x1b[34mConsole > Faxbot: \x1b[0m${line}`);

    messages.push({
      type: "private",
      who: { id: "-1", name: "console" },
      msg: line,
    });
  });
}

// Process this after the web interface has started, could take a while!
await controller.onNewDay();
// Start the actual bot!
await controller.startBotHeartbeat();
