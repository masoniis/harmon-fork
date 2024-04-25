import { html } from "common-tags";
import { Converter } from "showdown";
import xss from "xss";
import crypto from "node:crypto";
import { mkdir, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { cwd } from "node:process";
import {
  Router,
  error,
  withContent,
  withParams,
  html as ittyHtml,
} from "itty-router";

// Ensure data directories exist

const dataDir = process.env.DATA_DIR ?? `${cwd()}/data`;
const tokensDir = process.env.TOKENS_DIR ?? `${dataDir}/tokens`;
const usernamesDir = process.env.USERNAMES_DIR ?? `${dataDir}/usernames`;
const htmxDir = `${dataDir}/htmx`;
await mkdir(dataDir, { recursive: true });
await mkdir(tokensDir, { recursive: true });
await mkdir(usernamesDir, { recursive: true });
await mkdir(htmxDir, { recursive: true });

// Download htmx and required extensions

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

// Reused HTML components

const newMessageTextarea = html`
  <textarea
    autofocus
    id="new_message"
    name="new_message"
    onkeydown="handleNewMessageEnter(event)"
  ></textarea>
`;
const usernameB = (username: string) => html`
  <b
    id="username"
    hx-post="/edit_username"
    hx-swap="outerHTML"
    hx-include="#username_value"
    hx-trigger="click"
    >${username}</b
  >
`;
const usernameValue = (username: string, swapOob = false) => html`
  <input
    id="username_value"
    name="username"
    type="hidden"
    hidden
    value="${username}"
    ${swapOob ? `hx-swap-oob="true"` : ""}
  />
`;

// Keep track of these during operation

const registrations = new Set();
const sessions: Record<string, string> = {};

// Utility functions for dealing with files

function getTokenFile(token: string) {
  return Bun.file(`${tokensDir}/${token}`);
}
function getTokenFilePath(token: string) {
  return path.resolve(`${tokensDir}/${token}`);
}
function getUsernameFile(username: string) {
  return Bun.file(`${usernamesDir}/${username}`);
}
function getUsernameFilePath(username: string) {
  return path.resolve(`${usernamesDir}/${username}`);
}
async function getUsername(token: string) {
  return await getTokenFile(token).text();
}

// Random string generation

async function generateToken() {
  let token;
  do {
    token = crypto.randomBytes(48).toString("hex");
  } while (await getTokenFile(token).exists());
  registrations.add(token);
  return token;
}
async function generateUsername() {
  let username;
  do {
    username = `user${crypto.randomBytes(10).toString("hex")}`;
  } while (await getUsernameFile(username).exists());
  return username;
}
function generateSessionToken(token: string) {
  return Bun.hash(
    JSON.stringify({ token, t: new Date(), r: Math.random() }),
  ).toString();
}

/**
 * Validate a token and return a session token, registering a new user if applicable.
 */
async function login(token: string) {
  if (await getTokenFile(token).exists()) {
    return newSessionToken(token);
  }
  if (registrations.has(token)) {
    const username = await generateUsername();
    await symlink(getTokenFilePath(token), getUsernameFilePath(username));
    await Bun.write(getTokenFile(token), username);
    return newSessionToken(token);
  }
}

/**
 * Generate a session token and activate it.
 */
function newSessionToken(token: string) {
  const stoken = generateSessionToken(token);
  sessions[stoken] = token;
  return stoken;
}

/**
 * Exchange a valid session token for a new one, invalidating the old one.
 */
function nextSessionToken(stoken: string) {
  if (stoken in sessions) {
    const token = sessions[stoken];
    const newStoken = newSessionToken(stoken);
    sessions[newStoken] = token;
    delete sessions[stoken];
    return newStoken;
  }
}

/**
 * Change a user's username if it is not already taken.
 */
async function changeUsername(token: string, newUsernameRaw: string) {
  const newUsername = xss(Bun.escapeHTML(newUsernameRaw));
  if (newUsername.length <= 24) {
    const tokenFile = getTokenFile(token);
    if (await tokenFile.exists()) {
      const newUsernameFile = getUsernameFile(newUsername);
      if (!(await newUsernameFile.exists())) {
        const username = await tokenFile.text();
        await Bun.write(tokenFile, newUsername);
        await unlink(getUsernameFilePath(username));
        await symlink(
          getTokenFilePath(token),
          getUsernameFilePath(newUsername),
        );
        return newUsername;
      }
    }
  }
}

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
    const stoken = await login(token);
    if (!stoken) return invalid;
    const username = await getUsername(token);
    if (!username) return invalid;

    return new Response(html`
      <div id="main_area">
        <div id="nav_area">
          <div id="future_content"></div>
          <div id="user_info">
            ${usernameB(username)} ${usernameValue(username)}
            <p id="ws_status"></p>
          </div>
        </div>
        <div id="chat_area" hx-ext="ws" ws-connect="/chat">
          <div id="notifications"></div>
          <div id="chat_messages"></div>
          <form id="chat_controls" ws-send>
            ${newMessageTextarea}
            <input
              id="session_token"
              name="session_token"
              type="hidden"
              value="${stoken}"
            />
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    `);
  })
  .post(
    "/register",
    async () =>
      new Response(
        html`<a id="register_link">Your token is ${await generateToken()}</a>`,
      ),
  )
  .post(
    "/edit_username",
    async (req) =>
      new Response(html`
        <form
          hx-post="/set_username"
          hx-swap="outerHTML"
          hx-include="#session_token"
        >
          <input
            autofocus
            id="edit_username"
            name="username"
            value="${(await req.formData())?.get("username")}"
          />
        </form>
      `),
  )
  .post("/set_username", async (req) => {
    const invalid = new Response("Invalid username!", { status: 400 });

    const data = await req.formData();
    const stoken = data.get("session_token")?.toString();
    if (!(stoken && stoken in sessions)) return invalid;
    const username = data.get("username")?.toString();
    if (!username) return invalid;
    const newUsername = await changeUsername(sessions[stoken], username);
    if (!newUsername) return invalid;

    return new Response(
      html`${usernameB(newUsername)}${usernameValue(newUsername)}`,
    );
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

let prevMessageUsername = "";

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
    open(ws) {
      prevMessageUsername = "";
      ws.subscribe("chat-room");
    },
    async message(ws, message) {
      const data = JSON.parse(message.toString());

      let stoken = data.session_token;
      if (!(stoken && stoken in sessions)) return;
      stoken = nextSessionToken(stoken);
      (ws.data as any).stoken = stoken;

      const content = xss(
        new Converter({
          simpleLineBreaks: true,
          emoji: true,
          ghCodeBlocks: true,
        }).makeHtml(data.new_message),
      );
      const hash = Bun.hash(JSON.stringify({ content, t: new Date() }));

      const username = await getUsername(sessions[stoken]);

      server.publish(
        "chat-room",
        html`
          <div id="chat_messages" hx-swap-oob="beforeend">
            <div id="chat_message_${hash}" class="chat_message">
              ${prevMessageUsername !== username ? html` <hr /> ` : ""}
              <b
                ${prevMessageUsername === username ? "hidden" : ""}
                class="chat_message_username"
                >${username}</b
              >
              <div class="chat_message_content" hx-disable>${content}</div>
            </div>
          </div>
        `,
      );
      ws.sendText(
        html` <input
            id="session_token"
            name="session_token"
            type="hidden"
            value="${stoken}"
            hx-swap-oob="true"
          />
          ${newMessageTextarea}`,
      );

      prevMessageUsername = username;
    },
    close(ws) {
      const stoken = (ws.data as any)?.stoken;
      if (stoken) delete sessions[stoken];
    },
  },
});
