import { html } from "common-tags";
import { Converter } from "showdown";
import xss from "xss";

const converter = new Converter();

const newMessageTextarea = html`
  <textarea
    autofocus
    id="new_message"
    name="new_message"
    onkeydown="handleNewMessageEnter(event)"
  ></textarea>
`;

const server = Bun.serve({
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/index.css") {
      return new Response(Bun.file("index.css"));
    }
    if (url.pathname === "/login") {
      const data = await req.formData();
      console.log(data.get("token"));
      return new Response(html`
        <div id="chat_area" hx-ext="ws" ws-connect="/chat">
          <div id="notifications"></div>
          <div id="chat_messages"></div>
          <form id="chat_controls" ws-send>
            ${newMessageTextarea}
            <button type="submit">Send</button>
          </form>
        </div>
      `);
    }
    if (url.pathname === "/chat") {
      const success = server.upgrade(req);
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
    message(_ws, message) {
      const content = xss(
        converter.makeHtml(
          Bun.escapeHTML(JSON.parse(message.toString()).new_message),
        ),
      );
      const entry = {
        content,
        timestamp: new Date(),
      };
      console.log(entry);
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
    },
  },
});
