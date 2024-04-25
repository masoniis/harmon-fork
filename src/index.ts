import { cwd } from "node:process";
import { mkdir } from "node:fs/promises";
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
import ChatStatusMessage from "./components/ChatStatusMessage";

/*
 * Download htmx and required extensions
 */

const dataDir = process.env.DATA_DIR ?? `${cwd()}/data`;
const htmxDir = `${dataDir}/htmx`;
await mkdir(htmxDir, { recursive: true });

Bun.write(
  `${htmxDir}/htmx.min.js`,
  await (
    await fetch("https://unpkg.com/htmx.org@1.9.12/dist/htmx.min.js")
  ).text(),
);
Bun.write(
  `${htmxDir}/ws.js`,
  await (
    await fetch("https://unpkg.com/htmx.org@1.9.12/dist/ext/ws.js")
  ).text(),
);

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

    return new Response(MainArea(stoken, username));
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

    // Must be between 3 to 24 characters
    if (username.length < 1 || username.length > 24) return invalid;

    // Must pass HTML/XSS validation
    if (xss(Bun.escapeHTML(username)) !== username) return invalid;

    const oldUsername = await db.read("username", token);
    if (!oldUsername) return invalid;

    // Ensure new username is not in database
    if (await db.read("token", username)) return invalid;

    await db.write("token", username, token);
    await db.write("username", token, username);
    await db.delete("token", oldUsername);

    return new Response(Username(username));
  })
  .get("/", () => new Response(Bun.file(`${import.meta.dir}/index.html`)))
  .all(
    "/:file",
    ({ file }) => new Response(Bun.file(`${import.meta.dir}/${file}`)),
  )
  .all(
    "/htmx/:file",
    ({ file }) => new Response(Bun.file(`${htmxDir}/${file}`)),
  );

/*
 * Start server and handle WebSocket connections
 */

let prevMessageUsername = "";
let connections: Record<string, number> = {};

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
        prevMessageUsername = "";
        ws.subscribe("chat-room");
        ws.sendText(SessionToken(stoken));

        // Skip the status message if the user already has another open connection
        if (token in connections) {
          connections[token]++;
          return;
        }
        connections[token] = 1;

        server.publish(
          "chat-room",
          html`<div id="chat_messages" hx-swap-oob="beforeend">
            ${ChatStatusMessage("joined", username)}
          </div>`,
        );
        return;
      }

      const content = xss(
        new Converter({
          simpleLineBreaks: true,
          emoji: true,
          ghCodeBlocks: true,
        }).makeHtml(data.new_message),
      );

      server.publish(
        "chat-room",
        html`
          <div id="chat_messages" hx-swap-oob="beforeend">
            ${ChatMessage(content, username, prevMessageUsername === username)}
          </div>
        `,
      );
      ws.sendText(SessionToken(stoken));
      ws.sendText(ChatInput());

      prevMessageUsername = username;
    },
    async close(ws) {
      const stoken = (ws.data as any)?.stoken;
      if (!stoken) return;

      // Always delete a stoken regardless of whether it is valid
      const token = sessions.getLoginToken(stoken);
      sessions.delete(stoken);

      // Skip the status message if there are still other open connections
      if (!token || !(token in connections)) return;
      if (--connections[token] > 0) return;
      delete connections[token];

      const username = await db.read("username", token);
      if (!username) return;

      prevMessageUsername = "";
      server.publish(
        "chat-room",
        html`<div id="chat_messages" hx-swap-oob="beforeend">
          ${ChatStatusMessage("left", username)}
        </div>`,
      );
    },
  },
});
