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
    if (url.pathname === "/login") {
      const data = await req.formData();
      console.log(data.get("token"));
      return new Response(html`
        <div hx-ext="ws" ws-connect="/chat">
          <div id="notifications"></div>
          <div id="chat_room"></div>
          <form id="form" ws-send>
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
      ws.subscribe("chat_room");
    },
    message(_ws, message) {
      const new_message = xss(
        converter.makeHtml(
          Bun.escapeHTML(JSON.parse(message.toString()).new_message),
        ),
      );
      server.publish(
        "chat_room",
        html`
          <div id="chat_room" hx-swap-oob="beforeend">
            <div id="chat_message">${new_message}</div>
          </div>
          <div id="new_message" hx-swap-oob="true">${newMessageTextarea}</div>
        `,
      );
    },
  },
});
