import { cwd } from "node:process";
import { mkdir } from "node:fs/promises";
import { appendFile } from "node:fs/promises";
import { html } from "common-tags";
import { Converter } from "showdown";
import xss from "xss";
import {
  Router,
  error,
  withContent,
  withParams,
  html as ittyHtml,
} from "itty-router";
import Username from "./components/Username";
import ChatInput from "./components/ChatInput";
import ChatMessage from "./components/ChatMessage";
import SessionToken from "./components/SessionToken";
import EditUsernameForm from "./components/EditUsernameForm";
import MainArea from "./components/MainArea";
import sessions from "./sessions";
import db from "./db";
import User from "./components/User";
import UserPresence, { type Presence } from "./components/UserPresence";
import UserStatus from "./components/UserStatus";
import moment from "moment";

const dataDir = process.env.DATA_DIR ?? `${cwd()}/data`;
const chatHistoryFile =
  process.env.CHAT_HISTORY_FILE ?? `${dataDir}/chat_history`;

/*
 * Download client-side JS libraries
 */

const jsDir = `${dataDir}/js`;
await mkdir(jsDir, { recursive: true });
[
  "https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js",
  "https://unpkg.com/htmx.org@1.9.12/dist/ext/ws.js",
  "https://unpkg.com/moment@2.30.1/moment.js",
].map(async (url) => {
  Bun.write(
    `${jsDir}/${url.split("/").at(-1)}`,
    await (await fetch(url)).text(),
  );
});

/*
 * Cache user status
 */

const userInfo: Record<
  string,
  {
    username: string;
    presence: Presence;
    status: string;
    lastActive: moment.Moment;
  }
> = {};

// for (let i = 0; i < 100; i++) {
//   userInfo[`user${i}`] = {
//     username: `user${i}`,
//     presence: "online",
//     status: "online",
//     lastActive: moment(),
//   };
// }

let users = "";
function refreshUsers() {
  users = Object.values(userInfo)
    .sort((a, b) => a.username.localeCompare(b.username))
    .map((u) => User(u.username, u.presence, u.status))
    .join("");
}

const awayDuration = moment.duration(10, "minutes").asMilliseconds();
function setAway(token: string) {
  if (!(token in userInfo)) return;
  if (userInfo[token].presence === "offline") return;
  if (moment().diff(userInfo[token].lastActive) > awayDuration) {
    userInfo[token].presence = "away";
    userInfo[token].status = "away";
    server.publish(topic, UserPresence(userInfo[token].username, "away"));
    server.publish(topic, UserStatus(userInfo[token].username, "away"));
    refreshUsers();
  }
}

/*
 * Establish routes
 */

const router = Router({
  before: [withParams, withContent],
  catch: error,
  finally: [ittyHtml],
});

router
  .post("/login", async (req) => {
    const invalid = new Response("Invalid token!", {
      headers: { "HX-Retarget": "#login_error" },
    });

    const data = await req.formData();
    const token = data.get("token")?.toString();
    if (!token) return invalid;
    const stoken = await sessions.login(token);
    if (!stoken) return invalid;
    const username = await db.read("username", token);
    if (!username) return invalid;

    const chatHistory = Bun.file(chatHistoryFile);
    const messages = (await chatHistory.exists())
      ? await chatHistory.text()
      : "";

    return new Response(MainArea(stoken, username, "online", messages, users));
  })
  .post(
    "/register",
    async () =>
      new Response(
        html`<a id="register_link"
          >Your token is ${await sessions.register()}</a
        >`,
      ),
  )
  .post(
    "/edit_username",
    async (req) =>
      new Response(
        EditUsernameForm(
          (await req.formData())?.get("username")?.toString() ?? "",
        ),
      ),
  )
  .post("/set_username", async (req) => {
    const invalid = new Response("Invalid username!", { status: 400 });

    const data = await req.formData();
    const stoken = data.get("session_token")?.toString();
    if (!stoken) return invalid;
    const token = sessions.getLoginToken(stoken);
    if (!token) return invalid;
    const username = data.get("username")?.toString();
    if (!username) return invalid;

    if (username.length < 3 || username.length > 24) return invalid;

    // Must pass HTML/XSS validation
    if (xss(Bun.escapeHTML(username)) !== username) return invalid;

    const oldUsername = await db.read("username", token);
    if (!oldUsername) return invalid;

    // Ensure new username is not in database
    if (await db.read("token", username)) return invalid;

    await db.write("token", username, token);
    await db.write("username", token, username);
    await db.delete("token", oldUsername);

    if (token in userInfo) {
      userInfo[token].username = username;
      userInfo[token].lastActive = moment();
      setTimeout(() => setAway(token), awayDuration);
      refreshUsers();
      server.publish(topic, html` <div id="users">${users}</div> `);
    }

    return new Response(Username(username));
  })
  .get("/", () => new Response(Bun.file(`${import.meta.dir}/index.html`)))
  .all(
    "/:file",
    ({ file }) => new Response(Bun.file(`${import.meta.dir}/${file}`)),
  )
  .all("/js/:file", ({ file }) => new Response(Bun.file(`${jsDir}/${file}`)));

/*
 * Start server and handle WebSocket connections
 */

const topic = "chat_room";
let prevMessageUsername = "";
let prevMessageTime = moment();
const connections: Record<string, number> = {};

const server = Bun.serve({
  port: process.env.PORT ?? 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/chat") {
      return server.upgrade(req, { data: { stoken: null } })
        ? undefined
        : new Response("Websocket upgrade error", { status: 400 });
    }
    return router.fetch(req);
  },
  websocket: {
    async message(ws, message) {
      const data = JSON.parse(message.toString());

      // Always require valid session tokens
      let stoken = data.session_token;
      const token = sessions.getLoginToken(stoken);
      if (!token) return;
      stoken = await sessions.nextSessionToken(stoken);
      (ws.data as any).stoken = stoken;

      const username = await db.read("username", token);
      if (!username) return;

      // On first load, subscribe to the chat room and show a status message if necessary
      if (data.first_load) {
        ws.subscribe(topic);
        ws.sendText(SessionToken(stoken));

        // let status = await db.read("status", token);
        // if (!status) {
        //   status = "online";
        //   await db.write("status", token, status);
        // }
        const status = "online";
        const presence: Presence = "online";

        const updateOnly = token in userInfo;

        if (updateOnly) {
          server.publish(topic, UserPresence(username, presence));
          server.publish(topic, UserStatus(username, status));
        }

        userInfo[token] = { username, presence, status, lastActive: moment() };
        setTimeout(() => setAway(token), awayDuration);
        refreshUsers();

        if (!updateOnly) {
          server.publish(topic, html` <div id="users">${users}</div> `);
        }

        if (token in connections) {
          connections[token]++;
        } else {
          connections[token] = 1;
        }

        return;
      }

      const content = xss(
        new Converter({
          simpleLineBreaks: true,
          emoji: true,
          ghCodeBlocks: true,
        }).makeHtml(Bun.escapeHTML(data.new_message)),
      );

      const chatMessage = ChatMessage(
        content,
        username,
        prevMessageUsername === username &&
          moment().diff(prevMessageTime) <=
            moment.duration(1, "minute").asMilliseconds() &&
          prevMessageTime.minutes() === moment().minutes(),
      );
      prevMessageTime = moment();
      server.publish(
        topic,
        html`
          <div id="chat_messages" hx-swap-oob="beforeend">${chatMessage}</div>
        `,
      );
      server.publish(topic, UserPresence(username, "online"));
      await appendFile(chatHistoryFile, chatMessage);
      ws.sendText(SessionToken(stoken));
      ws.sendText(ChatInput());

      if (token in userInfo) {
        userInfo[token].lastActive = moment();
        setTimeout(() => setAway(token), awayDuration);
      }

      prevMessageUsername = username;

      refreshUsers();
    },
    async close(ws) {
      const stoken = (ws.data as any)?.stoken;
      if (!stoken) return;

      // Always delete a stoken regardless of whether it is valid
      const token = sessions.getLoginToken(stoken);
      sessions.delete(stoken);
      if (!token) return;

      const username = await db.read("username", token);
      if (!username) return;

      if (token in connections) {
        connections[token]--;
        if (connections[token] === 0) {
          delete connections[token];
        }
      }

      if (token in connections) return;

      server.publish(topic, UserPresence(username, "offline"));
      server.publish(topic, UserStatus(username, "offline"));

      if (token in userInfo) {
        userInfo[token].presence = "offline";
        userInfo[token].status = "offline";
      }
      refreshUsers();
    },
  },
});
