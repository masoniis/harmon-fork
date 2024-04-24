import { html } from "common-tags";
import { Converter } from "showdown";
import xss from "xss";
import crypto from "node:crypto";
import { mkdir } from "node:fs/promises";

const dataDir = process.env.DATA_DIR ?? "data";
const tokenDir = process.env.TOKEN_DIR ?? `${dataDir}/tokens`;

await mkdir(dataDir, { recursive: true });
await mkdir(tokenDir, { recursive: true });

const converter = new Converter();

const newMessageTextarea = html`
  <textarea
    autofocus
    id="new_message"
    name="new_message"
    onkeydown="handleNewMessageEnter(event)"
  ></textarea>
`;

const registrations = new Set();
const sessions: Record<string, string> = {};

function getTokenFile(token: string) {
  return Bun.file(`${tokenDir}/${token}`);
}

async function generateToken() {
  let token;
  do {
    token = crypto.randomBytes(48).toString("hex");
  } while (await Bun.file(`${tokenDir}/${token}`).exists());
  registrations.add(token);
  return token;
}

async function login(token: string) {
  if (await getTokenFile(token).exists()) {
    return newSessionToken(token);
  }
  if (registrations.has(token)) {
    await Bun.write(getTokenFile(token), "");
    return newSessionToken(token);
  }
}

function generateSessionToken(token: string) {
  return Bun.hash(
    JSON.stringify({ token, t: new Date(), r: Math.random() }),
  ).toString();
}

function newSessionToken(token: string) {
  const stoken = generateSessionToken(token);
  sessions[stoken] = token;
  return stoken;
}

function nextSessionToken(stoken: string) {
  if (stoken in sessions) {
    const token = sessions[stoken];
    const newStoken = newSessionToken(stoken);
    sessions[newStoken] = token;
    delete sessions[stoken];
    return newStoken;
  }
}

const server = Bun.serve({
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/index.css") {
      return new Response(Bun.file("index.css"));
    }
    if (url.pathname.startsWith("/htmx")) {
      return new Response(Bun.file(url.pathname.substring(1)));
    }
    if (url.pathname === "/register") {
      return new Response(
        html`<a id="register_link">Your token is ${await generateToken()}</a>`,
      );
    }
    if (url.pathname === "/login") {
      const data = await req.formData();
      const token = data.get("token")?.toString();
      if (token) {
        const stoken = await login(token);
        if (stoken) {
          return new Response(html`
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
          `);
        }
      }
      return new Response("Invalid token!", {
        headers: { "HX-Retarget": "#login_error" },
      });
    }
    if (url.pathname === "/chat") {
      const success = server.upgrade(req, { data: { stoken: null } });
      return success
        ? undefined
        : new Response("WebSocket upgrade error", { status: 400 });
    }
    return new Response(Bun.file("index.html"));
  },
  websocket: {
    open(ws) {
      ws.subscribe("chat-room");
    },
    message(ws, message) {
      const data = JSON.parse(message.toString());
      let stoken = data.session_token;
      if (stoken && stoken in sessions) {
        stoken = nextSessionToken(stoken);
        (ws.data as any).stoken = stoken;

        const content = xss(
          converter.makeHtml(Bun.escapeHTML(data.new_message)),
        );
        const entry = {
          content,
          timestamp: new Date(),
        };
        const hash = Bun.hash(JSON.stringify(entry));

        server.publish(
          "chat-room",
          html`
            <div id="chat_messages" hx-swap-oob="beforeend">
              <div id="chat_message_${hash}" class="chat_message">
                <div class="chat_message_content" hx-disable>${content}</div>
              </div>
            </div>
            ${newMessageTextarea}
          `,
        );
        ws.sendText(html`
            <input id="session_token" name="session_token" type="hidden" value="${stoken}" hx-swap-oob="true"></input>
          `);
      }
    },
    close(ws) {
      const stoken = (ws.data as any)?.stoken;
      if (stoken) delete sessions[stoken];
    },
  },
});
