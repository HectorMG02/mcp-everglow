export default function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 720,
        margin: "60px auto",
        padding: "0 20px",
        lineHeight: 1.55,
        color: "#111",
      }}
    >
      <h1 style={{ margin: "0 0 8px" }}>MCP Everglow</h1>
      <p style={{ color: "#555", margin: "0 0 32px" }}>
        Servidor de MCPs (Model Context Protocol) para conectar herramientas a
        ChatGPT, Claude y otros clientes que soporten Streamable HTTP.
      </p>

      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Endpoints disponibles</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: "8px 4px" }}>Servidor</th>
            <th style={{ padding: "8px 4px" }}>URL</th>
            <th style={{ padding: "8px 4px" }}>Qué hace</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #f5f5f5" }}>
            <td style={{ padding: "10px 4px" }}>
              <code>openclaw-whatsapp</code>
            </td>
            <td style={{ padding: "10px 4px" }}>
              <code>/openclaw-whatsapp/&lt;token&gt;/mcp</code>
            </td>
            <td style={{ padding: "10px 4px" }}>
              Envía un mensaje al WhatsApp de Héctor vía webhook.
            </td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Conectar en ChatGPT</h2>
      <ol style={{ paddingLeft: 20 }}>
        <li>
          Activa <strong>Developer Mode</strong> en ChatGPT (Settings →
          Connectors → Advanced).
        </li>
        <li>New connector → MCP server.</li>
        <li>
          Pega la URL completa incluyendo el token, por ejemplo{" "}
          <code>
            https://mcp-everglow.vercel.app/openclaw-whatsapp/alan/mcp
          </code>
        </li>
        <li>Authentication: <strong>No authentication</strong> (el token va en la URL).</li>
        <li>Guarda y prueba la tool desde un chat.</li>
      </ol>

      <p style={{ color: "#777", fontSize: 13, marginTop: 24 }}>
        El token forma parte de la URL: tratar el enlace como secreto.
      </p>
    </main>
  );
}
