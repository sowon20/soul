import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// 토큰 저장 경로
const TOKEN_PATH = path.join(__dirname, "tokens.json");

// 설정 (환경변수 또는 기본값)
const CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:8125/oauth/callback",
  scopes: [
    "https://www.googleapis.com/auth/homegraph",
    "https://www.googleapis.com/auth/sdm.service"
  ]
};

let transport = null;

// ========== 토큰 관리 ==========
function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("토큰 로드 실패:", e.message);
  }
  return null;
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken() {
  const tokens = loadTokens();
  if (!tokens?.refresh_token) {
    throw new Error("Refresh token이 없습니다. 다시 로그인하세요.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token"
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  const newTokens = {
    ...tokens,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000)
  };
  saveTokens(newTokens);
  return newTokens;
}

async function getValidToken() {
  let tokens = loadTokens();
  if (!tokens?.access_token) {
    throw new Error("로그인이 필요합니다.");
  }

  // 만료 5분 전에 갱신
  if (tokens.expires_at && tokens.expires_at < Date.now() + 300000) {
    tokens = await refreshAccessToken();
  }

  return tokens.access_token;
}

// ========== HomeGraph API ==========
async function getDevices() {
  const token = await getValidToken();

  // Smart Device Management API 사용
  const response = await fetch(
    "https://smartdevicemanagement.googleapis.com/v1/enterprises/-/devices",
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "기기 조회 실패");
  }

  return data.devices || [];
}

async function executeCommand(deviceId, command, params = {}) {
  const token = await getValidToken();

  const response = await fetch(
    `https://smartdevicemanagement.googleapis.com/v1/${deviceId}:executeCommand`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ command, params })
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "명령 실행 실패");
  }

  return data;
}

// ========== MCP 서버 ==========
const server = new Server({
  name: "soul-google-home",
  version: "1.0.0",
}, {
  capabilities: { tools: {} },
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_devices",
      description: "Google Home에 연결된 기기 목록을 조회합니다.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "control_device",
      description: "기기를 제어합니다 (on/off, 밝기 등).",
      inputSchema: {
        type: "object",
        properties: {
          deviceId: { type: "string", description: "기기 ID" },
          command: { type: "string", description: "명령 (예: OnOff, Brightness)" },
          params: { type: "object", description: "명령 파라미터" }
        },
        required: ["deviceId", "command"]
      }
    },
    {
      name: "get_device_state",
      description: "특정 기기의 상태를 조회합니다.",
      inputSchema: {
        type: "object",
        properties: {
          deviceId: { type: "string", description: "기기 ID" }
        },
        required: ["deviceId"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  const args = req.params.arguments || {};

  try {
    switch (name) {
      case "list_devices": {
        const devices = await getDevices();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(devices, null, 2)
          }]
        };
      }
      case "control_device": {
        const result = await executeCommand(args.deviceId, args.command, args.params);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };
      }
      case "get_device_state": {
        const token = await getValidToken();
        const response = await fetch(
          `https://smartdevicemanagement.googleapis.com/v1/${args.deviceId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
      default:
        return { isError: true, content: [{ type: "text", text: "알 수 없는 명령" }] };
    }
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});

// ========== OAuth 엔드포인트 ==========

// OAuth 설정 저장
app.post("/api/config", (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  CONFIG.clientId = clientId || CONFIG.clientId;
  CONFIG.clientSecret = clientSecret || CONFIG.clientSecret;
  CONFIG.redirectUri = redirectUri || CONFIG.redirectUri;
  res.json({ success: true });
});

// OAuth 설정 조회
app.get("/api/config", (req, res) => {
  res.json({
    clientId: CONFIG.clientId ? "***설정됨***" : "",
    redirectUri: CONFIG.redirectUri,
    hasSecret: !!CONFIG.clientSecret
  });
});

// OAuth 로그인 URL 생성
app.get("/api/auth/url", (req, res) => {
  if (!CONFIG.clientId) {
    return res.status(400).json({ error: "Client ID가 설정되지 않았습니다." });
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", CONFIG.clientId);
  url.searchParams.set("redirect_uri", CONFIG.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CONFIG.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  res.json({ url: url.toString() });
});

// OAuth 콜백
app.get("/oauth/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.send(`<script>alert("인증 실패: ${error}"); window.close();</script>`);
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CONFIG.clientId,
        client_secret: CONFIG.clientSecret,
        redirect_uri: CONFIG.redirectUri,
        grant_type: "authorization_code"
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000)
    });

    res.send(`
      <script>
        alert("인증 성공!");
        window.opener?.postMessage({ type: "oauth_success" }, "*");
        window.close();
      </script>
    `);
  } catch (e) {
    res.send(`<script>alert("토큰 교환 실패: ${e.message}"); window.close();</script>`);
  }
});

// 토큰 상태 확인
app.get("/api/auth/status", (req, res) => {
  const tokens = loadTokens();
  if (!tokens?.access_token) {
    return res.json({ authenticated: false });
  }

  const isExpired = tokens.expires_at && tokens.expires_at < Date.now();
  res.json({
    authenticated: true,
    expired: isExpired,
    expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null
  });
});

// 토큰 갱신
app.post("/api/auth/refresh", async (req, res) => {
  try {
    const tokens = await refreshAccessToken();
    res.json({ success: true, expiresAt: new Date(tokens.expires_at).toISOString() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 로그아웃
app.post("/api/auth/logout", (req, res) => {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
  res.json({ success: true });
});

// ========== 기기 API ==========
app.get("/api/devices", async (req, res) => {
  try {
    const devices = await getDevices();
    res.json({ devices });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/devices/:deviceId/command", async (req, res) => {
  try {
    const { command, params } = req.body;
    const result = await executeCommand(req.params.deviceId, command, params);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ========== SSE (MCP) ==========
app.get("/sse", async (req, res) => {
  console.log("🏠 Google Home MCP 연결!");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write("retry: 1000\n\n");

  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);

  req.on("close", () => {
    console.log("❌ Google Home MCP 연결 종료");
    if (transport) {
      transport.close();
      transport = null;
    }
  });
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport active");
  }
});

// 서버 시작
const PORT = process.env.PORT || 8125;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🏠 Google Home MCP 서버: http://localhost:${PORT}`);
  console.log(`📡 MCP SSE: http://localhost:${PORT}/sse`);
});
