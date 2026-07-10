// Cliente HTTP del Gateway de OpenClaw + registro de tools MCP.
// El gateway expone (docs oficiales del paquete openclaw):
//   POST /tools/invoke          → invoca cualquier tool del gateway (auth Bearer = operador)
//   POST /v1/chat/completions   → turno completo de agente (OpenAI-compatible)
//   GET  /health                → estado del gateway
import { z } from "zod";

export const WEBHOOK_URL =
  process.env.OPENCLAW_WHATSAPP_WEBHOOK_URL ?? "https://webhook.everglow.es/";

export const GATEWAY_URL = (
  process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789"
).replace(/\/+$/, "");

export const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? "";

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!GATEWAY_TOKEN) {
    throw new Error(
      "OPENCLAW_GATEWAY_TOKEN no configurado en el entorno del MCP."
    );
  }
  return fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GATEWAY_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/** Invoca una tool del gateway vía POST /tools/invoke y devuelve el texto del resultado. */
async function invokeGatewayTool(params: {
  tool: string;
  action?: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
}): Promise<ToolResult> {
  try {
    const res = await gatewayFetch("/tools/invoke", {
      method: "POST",
      body: JSON.stringify({
        tool: params.tool,
        ...(params.action ? { action: params.action } : {}),
        args: params.args ?? {},
        ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      const detail =
        body?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
      return fail(`Error del gateway OpenClaw (tool ${params.tool}): ${detail}`);
    }
    const texts: string[] = (body.result?.content ?? [])
      .filter((c: { type?: string }) => c?.type === "text")
      .map((c: { text?: string }) => c.text ?? "");
    const text = texts.join("\n").trim();
    return ok(
      text || JSON.stringify(body.result?.details ?? body.result ?? {}, null, 2)
    );
  } catch (err) {
    return fail(`Fallo al contactar el gateway OpenClaw: ${errMsg(err)}`);
  }
}

// El tipo real del server que entrega mcp-handler a su callback de inicialización.
type McpServerLike = Parameters<
  Parameters<typeof import("mcp-handler").createMcpHandler>[0]
>[0];

/** Registra el set completo de tools de OpenClaw en un server MCP. */
export function registerOpenclawTools(server: McpServerLike): void {
  // --- 1. WhatsApp directo a Héctor (webhook, compatible con la versión anterior) ---
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
    async ({ message }: { message: string }) => {
      try {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return fail(
            `Error enviando WhatsApp: HTTP ${res.status} ${res.statusText}. ${body}`
          );
        }
        return ok("Mensaje enviado por WhatsApp correctamente.");
      } catch (err) {
        return fail(`Fallo al contactar el webhook: ${errMsg(err)}`);
      }
    }
  );

  // --- 2. Turno completo de agente (pregunta a OpenClaw y devuelve su respuesta) ---
  server.registerTool(
    "openclaw_ask",
    {
      title: "Ask OpenClaw agent",
      description:
        "Ejecuta un turno completo del agente de OpenClaw (mismo camino que un mensaje de chat) y devuelve su respuesta. El agente puede usar todas sus tools (web, ficheros, exec, memoria...). Úsalo para delegarle tareas o preguntarle cualquier cosa.",
      inputSchema: {
        message: z.string().min(1).describe("Mensaje o instrucción para el agente."),
        agent: z
          .string()
          .optional()
          .describe(
            'Agente destino (id configurado en OpenClaw). Por defecto el agente principal ("main").'
          ),
      },
    },
    async ({ message, agent }: { message: string; agent?: string }) => {
      try {
        const res = await gatewayFetch("/v1/chat/completions", {
          method: "POST",
          body: JSON.stringify({
            model: agent ? `openclaw/${agent}` : "openclaw",
            messages: [{ role: "user", content: message }],
          }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const detail =
            body?.error?.message ?? `HTTP ${res.status} ${res.statusText}`;
          return fail(`Error en el turno de agente: ${detail}`);
        }
        const reply = body?.choices?.[0]?.message?.content;
        return ok(
          typeof reply === "string" && reply.trim()
            ? reply
            : JSON.stringify(body, null, 2)
        );
      } catch (err) {
        return fail(`Fallo al contactar el gateway OpenClaw: ${errMsg(err)}`);
      }
    }
  );

  // --- 3. Enviar mensaje por cualquier canal conectado ---
  server.registerTool(
    "openclaw_send_message",
    {
      title: "Send message via OpenClaw channel",
      description:
        "Envía un mensaje directo por cualquier canal conectado a OpenClaw (telegram, whatsapp, discord, slack...) a un destinatario concreto, sin pasar por el agente.",
      inputSchema: {
        channel: z
          .string()
          .describe('Canal: "telegram", "whatsapp", "discord", "slack", etc.'),
        target: z
          .string()
          .describe(
            "Destinatario: teléfono (+34...), chat id, @usuario o #canal según el canal."
          ),
        message: z.string().min(1).describe("Texto del mensaje."),
      },
    },
    async ({
      channel,
      target,
      message,
    }: {
      channel: string;
      target: string;
      message: string;
    }) =>
      invokeGatewayTool({
        tool: "message",
        action: "send",
        args: { channel, target, message },
      })
  );

  // --- 4. Sesiones: listar ---
  server.registerTool(
    "openclaw_sessions",
    {
      title: "List OpenClaw sessions",
      description:
        "Lista las sesiones/conversaciones activas de OpenClaw (clave, agente, canal, modelo, tokens y última actividad).",
      inputSchema: {
        limit: z.number().int().positive().optional().describe("Máximo de sesiones a devolver."),
      },
    },
    async ({ limit }: { limit?: number }) =>
      invokeGatewayTool({
        tool: "sessions_list",
        args: limit ? { limit } : {},
      })
  );

  // --- 5. Sesiones: historial ---
  server.registerTool(
    "openclaw_history",
    {
      title: "Read OpenClaw session history",
      description:
        "Lee el transcript (mensajes recientes) de una sesión concreta de OpenClaw.",
      inputSchema: {
        sessionKey: z
          .string()
          .describe('Clave de sesión, p. ej. "agent:main:main" (ver openclaw_sessions).'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Número de mensajes recientes a devolver (por defecto 20)."),
      },
    },
    async ({ sessionKey, limit }: { sessionKey: string; limit?: number }) =>
      invokeGatewayTool({
        tool: "sessions_history",
        args: { sessionKey, limit: limit ?? 20 },
      })
  );

  // --- 6. Sesiones: enviar mensaje a otra sesión ---
  server.registerTool(
    "openclaw_session_send",
    {
      title: "Send message to OpenClaw session",
      description:
        "Inyecta un mensaje en otra sesión de OpenClaw (p. ej. para dar contexto o instrucciones a una conversación en curso).",
      inputSchema: {
        sessionKey: z.string().describe("Clave de la sesión destino."),
        message: z.string().min(1).describe("Mensaje a enviar a esa sesión."),
      },
    },
    async ({ sessionKey, message }: { sessionKey: string; message: string }) =>
      invokeGatewayTool({
        tool: "sessions_send",
        args: { sessionKey, message },
      })
  );

  // --- 7. Cron / tareas programadas ---
  server.registerTool(
    "openclaw_cron",
    {
      title: "Manage OpenClaw cron jobs",
      description:
        "Gestiona las tareas programadas (cron) de OpenClaw: listar, crear, editar, activar/desactivar o borrar. Pasa la acción y sus argumentos.",
      inputSchema: {
        action: z
          .string()
          .describe('Acción del tool cron: "list", "add", "update", "remove", "enable", "disable", "run", "runs"...'),
        args: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Argumentos adicionales de la acción (job, schedule, message...)."),
      },
    },
    async ({ action, args }: { action: string; args?: Record<string, unknown> }) =>
      invokeGatewayTool({
        tool: "cron",
        args: { action, ...(args ?? {}) },
      })
  );

  // --- 8. Estado del gateway ---
  server.registerTool(
    "openclaw_status",
    {
      title: "OpenClaw gateway status",
      description:
        "Comprueba que el gateway de OpenClaw está vivo y devuelve su estado de salud.",
      inputSchema: {},
    },
    async () => {
      try {
        const res = await gatewayFetch("/health");
        const body = await res.text();
        return res.ok
          ? ok(`Gateway OpenClaw accesible en ${GATEWAY_URL}: ${body}`)
          : fail(`Gateway respondió HTTP ${res.status}: ${body}`);
      } catch (err) {
        return fail(`Gateway OpenClaw inaccesible (${GATEWAY_URL}): ${errMsg(err)}`);
      }
    }
  );

  // --- 9. Invocación genérica: cualquier tool del gateway ("hacer de todo") ---
  server.registerTool(
    "openclaw_invoke",
    {
      title: "Invoke any OpenClaw tool",
      description:
        "Invoca directamente CUALQUIER tool del gateway de OpenClaw vía /tools/invoke. Úsalo para todo lo que no cubran las demás tools. Ejemplos de tools: message, sessions_list, sessions_history, sessions_send, sessions_spawn, session_status, agents_list, subagents, cron, gateway, nodes, memory_search, web_search, browser, image, tts, canvas... Si una tool no está permitida el gateway devuelve 404.",
      inputSchema: {
        tool: z.string().describe("Nombre de la tool del gateway a invocar."),
        action: z
          .string()
          .optional()
          .describe("Acción de la tool (si la tool distingue acciones)."),
        args: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Argumentos específicos de la tool, como objeto JSON."),
        sessionKey: z
          .string()
          .optional()
          .describe('Sesión sobre la que ejecutar (por defecto "main").'),
      },
    },
    async (params: {
      tool: string;
      action?: string;
      args?: Record<string, unknown>;
      sessionKey?: string;
    }) => invokeGatewayTool(params)
  );
}
