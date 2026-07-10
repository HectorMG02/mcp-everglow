// Servidor MCP de OpenClaw. Acepta dos formas de URL:
//   /openclaw-whatsapp/<transport>          → alias sin token (compatibilidad)
//   /openclaw-whatsapp/<token>/<transport>  → con token estático en el path
import { createMcpHandler } from "mcp-handler";
import { registerOpenclawTools } from "@/lib/openclaw";

const VALID_TOKENS = new Set(
  (process.env.OPENCLAW_WHATSAPP_TOKENS ?? "alan")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
);

type McpHandler = (req: Request) => Promise<Response> | Response;

const handlerCache = new Map<string, McpHandler>();

function getHandler(basePath: string): McpHandler {
  let h = handlerCache.get(basePath);
  if (!h) {
    h = createMcpHandler(
      (server) => {
        registerOpenclawTools(server);
      },
      {
        serverInfo: {
          name: "openclaw",
          version: "2.0.0",
        },
      },
      {
        basePath,
        maxDuration: 300,
        verboseLogs: false,
      }
    ) as unknown as McpHandler;
    handlerCache.set(basePath, h);
  }
  return h;
}

async function dispatch(
  req: Request,
  ctx: { params: Promise<{ slug?: string[] }> }
): Promise<Response> {
  const { slug = [] } = await ctx.params;

  // /openclaw-whatsapp/<transport>
  if (slug.length === 1) {
    return getHandler("/openclaw-whatsapp")(req);
  }

  // /openclaw-whatsapp/<token>/<transport>
  if (slug.length === 2) {
    const [token] = slug;
    if (!VALID_TOKENS.has(token)) {
      return new Response("Not found", { status: 404 });
    }
    return getHandler(`/openclaw-whatsapp/${token}`)(req);
  }

  return new Response("Not found", { status: 404 });
}

export {
  dispatch as GET,
  dispatch as POST,
  dispatch as DELETE,
};
