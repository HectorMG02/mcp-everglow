import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const WEBHOOK_URL =
  process.env.OPENCLAW_WHATSAPP_WEBHOOK_URL ?? "https://webhook.everglow.es/";

const VALID_TOKENS = new Set(
  (process.env.OPENCLAW_WHATSAPP_TOKENS ?? "alan")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
);

type McpHandler = (req: Request) => Promise<Response> | Response;

const handlerCache = new Map<string, McpHandler>();

function buildHandler(token: string): McpHandler {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "send_whatsapp",
        {
          title: "Send WhatsApp",
          description:
            "Envía un mensaje de WhatsApp al móvil de Héctor a través del webhook de Everglow. Úsalo para notificar, avisar o entregar resultados breves directamente al móvil.",
          inputSchema: {
            message: z
              .string()
              .min(1)
              .describe("Texto del mensaje a enviar por WhatsApp."),
          },
        },
        async ({ message }) => {
          try {
            const res = await fetch(WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message }),
            });

            if (!res.ok) {
              const body = await res.text().catch(() => "");
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: `Error enviando WhatsApp: HTTP ${res.status} ${res.statusText}. ${body}`,
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: "Mensaje enviado por WhatsApp correctamente.",
                },
              ],
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              isError: true,
              content: [
                { type: "text", text: `Fallo al contactar el webhook: ${msg}` },
              ],
            };
          }
        }
      );
    },
    {
      serverInfo: {
        name: "openclaw-whatsapp",
        version: "1.0.0",
      },
    },
    {
      basePath: `/openclaw-whatsapp/${token}`,
      maxDuration: 60,
      verboseLogs: false,
    }
  ) as unknown as McpHandler;
}

function getHandler(token: string): McpHandler {
  let h = handlerCache.get(token);
  if (!h) {
    h = buildHandler(token);
    handlerCache.set(token, h);
  }
  return h;
}

async function dispatch(
  req: Request,
  ctx: { params: Promise<{ token: string; transport: string }> }
): Promise<Response> {
  const { token } = await ctx.params;
  if (!VALID_TOKENS.has(token)) {
    return new Response("Not found", { status: 404 });
  }
  return getHandler(token)(req);
}

export {
  dispatch as GET,
  dispatch as POST,
  dispatch as DELETE,
};
