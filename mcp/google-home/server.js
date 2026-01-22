import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import crypto from "crypto";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// CORS 허용 (admin UI에서 접근)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));

// 루트 → Admin UI 리다이렉트
app.get('/', (req, res) => res.redirect('/admin/'));

// Admin UI 정적 파일 서빙
app.use('/admin', express.static(path.join(__dirname, 'admin-dist')));
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-dist', 'index.html'));
});

// 파일 경로
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");
const TOKEN_CACHE_PATH = path.join(__dirname, "token-cache.json");
const DEVICES_PATH = path.join(__dirname, "devices.json");
const USER_AUTH_PATH = path.join(__dirname, "user-auth.json");
const GLOCAL_CACHE_PATH = path.join(__dirname, "glocal-cache.json");

let transport = null;
let cachedToken = null;
let tokenRefreshTimer = null;

// ========== 서비스 계정 관리 ==========
function loadServiceAccount() {
  try {
    if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("서비스 계정 로드 실패:", e.message);
  }
  return null;
}

function saveServiceAccount(data) {
  fs.writeFileSync(SERVICE_ACCOUNT_PATH, JSON.stringify(data, null, 2));
  console.log("✅ 서비스 계정 저장됨");
}

// ========== JWT 생성 및 토큰 발급 ==========
function base64UrlEncode(data) {
  return Buffer.from(data)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createJWT(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1시간

  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: serviceAccount.private_key_id
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: expiry,
    scope: "https://www.googleapis.com/auth/homegraph"
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = sign.sign(serviceAccount.private_key, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${signInput}.${signature}`;
}

async function getAccessToken(forceRefresh = false) {
  // 캐시된 토큰 확인
  if (!forceRefresh && cachedToken) {
    const now = Date.now();
    // 만료 5분 전까지 유효
    if (cachedToken.expires_at > now + 300000) {
      return cachedToken.access_token;
    }
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    throw new Error("서비스 계정이 설정되지 않았습니다.");
  }

  console.log("🔄 토큰 발급 중...");
  const jwt = createJWT(serviceAccount);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000)
  };

  // 토큰 캐시 저장
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(cachedToken, null, 2));
  console.log("✅ 토큰 발급 완료, 만료:", new Date(cachedToken.expires_at).toLocaleString());

  // 자동 갱신 타이머 설정 (만료 5분 전)
  scheduleTokenRefresh();

  return cachedToken.access_token;
}

function scheduleTokenRefresh() {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
  }

  if (!cachedToken) return;

  const refreshTime = cachedToken.expires_at - Date.now() - 300000; // 만료 5분 전
  if (refreshTime > 0) {
    console.log(`⏰ 토큰 자동 갱신 예약: ${Math.round(refreshTime / 60000)}분 후`);
    tokenRefreshTimer = setTimeout(async () => {
      try {
        await getAccessToken(true);
        console.log("✅ 토큰 자동 갱신 완료");
      } catch (e) {
        console.error("❌ 토큰 자동 갱신 실패:", e.message);
      }
    }, refreshTime);
  }
}

// 시작 시 캐시된 토큰 로드
function loadCachedToken() {
  try {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      cachedToken = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, "utf-8"));
      if (cachedToken.expires_at > Date.now()) {
        console.log("📦 캐시된 토큰 로드됨, 만료:", new Date(cachedToken.expires_at).toLocaleString());
        scheduleTokenRefresh();
      } else {
        cachedToken = null;
      }
    }
  } catch (e) {
    console.error("토큰 캐시 로드 실패:", e.message);
  }
}

// ========== 디바이스 관리 ==========
function loadDevices() {
  try {
    if (fs.existsSync(DEVICES_PATH)) {
      return JSON.parse(fs.readFileSync(DEVICES_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("디바이스 로드 실패:", e.message);
  }
  return [];
}

function saveDevices(devices) {
  fs.writeFileSync(DEVICES_PATH, JSON.stringify(devices, null, 2));
}

// ========== HomeGraph API ==========
async function queryDevices(agentUserId) {
  const token = await getAccessToken();

  const response = await fetch(
    "https://homegraph.googleapis.com/v1/devices:query",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentUserId: agentUserId,
        inputs: [{
          payload: {
            devices: [] // 빈 배열 = 모든 기기
          }
        }]
      })
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "기기 조회 실패");
  }

  return data;
}

async function syncDevices(agentUserId) {
  const token = await getAccessToken();

  const response = await fetch(
    "https://homegraph.googleapis.com/v1/devices:sync",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ agentUserId })
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "동기화 실패");
  }

  return data;
}

async function reportState(agentUserId, deviceStates) {
  const token = await getAccessToken();

  const response = await fetch(
    "https://homegraph.googleapis.com/v1/devices:reportStateAndNotification",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agentUserId,
        requestId: crypto.randomUUID(),
        payload: {
          devices: {
            states: deviceStates
          }
        }
      })
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || "상태 보고 실패");
  }

  return data;
}

// ========== glocaltokens 통합 (사용자 OAuth) ==========

let glocalCache = null;

function loadUserAuth() {
  try {
    if (fs.existsSync(USER_AUTH_PATH)) {
      return JSON.parse(fs.readFileSync(USER_AUTH_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("사용자 인증 정보 로드 실패:", e.message);
  }
  return null;
}

function saveUserAuth(data) {
  fs.writeFileSync(USER_AUTH_PATH, JSON.stringify(data, null, 2));
  console.log("✅ 사용자 인증 정보 저장됨");
}

function loadGlocalCache() {
  try {
    if (fs.existsSync(GLOCAL_CACHE_PATH)) {
      glocalCache = JSON.parse(fs.readFileSync(GLOCAL_CACHE_PATH, "utf-8"));
      return glocalCache;
    }
  } catch (e) {
    console.error("glocal 캐시 로드 실패:", e.message);
  }
  return null;
}

function saveGlocalCache(data) {
  glocalCache = data;
  fs.writeFileSync(GLOCAL_CACHE_PATH, JSON.stringify(data, null, 2));
}

// Python glocaltokens bridge 호출
function callGlocalBridge(command, env = {}) {
  return new Promise((resolve, reject) => {
    // Python 경로 결정 (가상환경 우선)
    let pythonPath = "python3"; // 기본값
    const envPython = process.env.PYTHON_PATH;

    // 1. 환경변수로 지정된 경로
    if (envPython && fs.existsSync(path.join(envPython, "bin/python3"))) {
      pythonPath = path.join(envPython, "bin/python3");
    }
    // 2. 로컬 glocaltokens_env 가상환경 (라즈베리파이)
    else if (fs.existsSync(path.join(__dirname, "glocaltokens_env/bin/python3"))) {
      pythonPath = path.join(__dirname, "glocaltokens_env/bin/python3");
    }
    // 3. 홈 디렉토리 glocaltokens_env
    else if (fs.existsSync(path.join(process.env.HOME || "", "glocaltokens_env/bin/python3"))) {
      pythonPath = path.join(process.env.HOME, "glocaltokens_env/bin/python3");
    }
    // 4. Codespaces Python
    else if (fs.existsSync("/home/codespace/.python/current/bin/python3")) {
      pythonPath = "/home/codespace/.python/current/bin/python3";
    }

    console.log(`🐍 Python 경로: ${pythonPath}`);
    const scriptPath = path.join(__dirname, "glocaltokens_bridge.py");

    const proc = spawn(pythonPath, [scriptPath, command], {
      env: { ...process.env, ...env },
      cwd: __dirname
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (stderr) {
        console.error("glocaltokens stderr:", stderr);
      }

      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(new Error(`Python 출력 파싱 실패: ${stdout || stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Python 실행 실패: ${err.message}`));
    });
  });
}

// 사용자 Google 계정으로 인증
async function authenticateUser(username, password, androidId = null) {
  console.log("🔑 사용자 Google 계정 인증 중...");

  const env = {
    GOOGLE_USERNAME: username,
    GOOGLE_PASSWORD: password,
  };

  if (androidId) {
    env.ANDROID_ID = androidId;
  }

  const result = await callGlocalBridge("get_master_token", env);

  if (result.success && result.master_token) {
    // master token만 저장 (비밀번호는 저장하지 않음)
    saveUserAuth({
      username,
      master_token: result.master_token,
      android_id: androidId,
      authenticated_at: new Date().toISOString()
    });
    console.log("✅ 사용자 인증 완료");
    return result;
  }

  throw new Error("인증 실패");
}

// Google Home 기기 목록 조회
async function fetchGoogleDevices() {
  const userAuth = loadUserAuth();

  if (!userAuth || !userAuth.master_token) {
    throw new Error("사용자 인증이 필요합니다. 먼저 Google 계정으로 로그인하세요.");
  }

  console.log("📱 Google Home 기기 조회 중...");

  const env = {
    GOOGLE_USERNAME: userAuth.username,
    GOOGLE_MASTER_TOKEN: userAuth.master_token,
  };

  if (userAuth.android_id) {
    env.ANDROID_ID = userAuth.android_id;
  }

  const result = await callGlocalBridge("get_devices", env);

  if (result.success) {
    // 결과 캐싱
    saveGlocalCache({
      devices: result.devices,
      fetched_at: new Date().toISOString()
    });
    console.log(`✅ ${result.devices?.length || 0}개 기기 조회 완료`);
    return result;
  }

  throw new Error("기기 조회 실패");
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
      name: "list_google_home_devices",
      description: "연결된 Google Home 기기 목록을 조회합니다.",
      inputSchema: {
        type: "object",
        properties: {
          refresh: { type: "boolean", description: "캐시 무시하고 새로 조회", default: false }
        }
      }
    },
    {
      name: "get_device_local_token",
      description: "특정 기기의 로컬 인증 토큰을 가져옵니다.",
      inputSchema: {
        type: "object",
        properties: {
          deviceName: { type: "string", description: "기기 이름" }
        },
        required: ["deviceName"]
      }
    },
    {
      name: "query_devices",
      description: "HomeGraph에서 기기 상태를 조회합니다. (Smart Home Action 전용)",
      inputSchema: {
        type: "object",
        properties: {
          agentUserId: { type: "string", description: "에이전트 사용자 ID" }
        },
        required: ["agentUserId"]
      }
    },
    {
      name: "sync_devices",
      description: "HomeGraph와 기기를 동기화합니다. (Smart Home Action 전용)",
      inputSchema: {
        type: "object",
        properties: {
          agentUserId: { type: "string", description: "에이전트 사용자 ID" }
        },
        required: ["agentUserId"]
      }
    },
    {
      name: "report_state",
      description: "기기 상태를 HomeGraph에 보고합니다. (Smart Home Action 전용)",
      inputSchema: {
        type: "object",
        properties: {
          agentUserId: { type: "string", description: "에이전트 사용자 ID" },
          deviceStates: { type: "object", description: "기기별 상태 객체" }
        },
        required: ["agentUserId", "deviceStates"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  const args = req.params.arguments || {};

  try {
    switch (name) {
      case "list_google_home_devices": {
        let data;
        if (args.refresh) {
          data = await fetchGoogleDevices();
        } else {
          data = loadGlocalCache();
          if (!data) {
            data = await fetchGoogleDevices();
          }
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              devices: data.devices || [],
              count: data.devices?.length || 0,
              fetchedAt: data.fetched_at
            }, null, 2)
          }]
        };
      }
      case "get_device_local_token": {
        const cached = loadGlocalCache();
        if (!cached || !cached.devices) {
          throw new Error("기기 목록이 없습니다. 먼저 list_google_home_devices를 호출하세요.");
        }
        const device = cached.devices.find(d =>
          d.device_name?.toLowerCase() === args.deviceName?.toLowerCase() ||
          d.hardware?.toLowerCase().includes(args.deviceName?.toLowerCase())
        );
        if (!device) {
          throw new Error(`기기를 찾을 수 없습니다: ${args.deviceName}`);
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              deviceName: device.device_name,
              hardware: device.hardware,
              localAuthToken: device.local_auth_token
            }, null, 2)
          }]
        };
      }
      case "query_devices": {
        const result = await queryDevices(args.agentUserId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
      case "sync_devices": {
        const result = await syncDevices(args.agentUserId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
      case "report_state": {
        const result = await reportState(args.agentUserId, args.deviceStates);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      }
      default:
        return { isError: true, content: [{ type: "text", text: "알 수 없는 명령" }] };
    }
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});

// ========== REST API ==========

// 서비스 계정 업로드
app.post("/api/service-account", (req, res) => {
  try {
    const { serviceAccount } = req.body;

    if (!serviceAccount || !serviceAccount.private_key || !serviceAccount.client_email) {
      return res.status(400).json({ error: "유효하지 않은 서비스 계정 파일입니다." });
    }

    saveServiceAccount(serviceAccount);

    // 토큰 캐시 초기화
    cachedToken = null;
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      fs.unlinkSync(TOKEN_CACHE_PATH);
    }

    res.json({
      success: true,
      email: serviceAccount.client_email,
      projectId: serviceAccount.project_id
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 서비스 계정 상태 확인
app.get("/api/service-account/status", (req, res) => {
  const sa = loadServiceAccount();
  if (!sa) {
    return res.json({ configured: false });
  }

  res.json({
    configured: true,
    email: sa.client_email,
    projectId: sa.project_id
  });
});

// 토큰 상태 확인
app.get("/api/token/status", async (req, res) => {
  try {
    if (!cachedToken) {
      return res.json({ hasToken: false });
    }

    const isExpired = cachedToken.expires_at < Date.now();
    res.json({
      hasToken: true,
      expired: isExpired,
      expiresAt: new Date(cachedToken.expires_at).toISOString(),
      remainingMinutes: Math.max(0, Math.round((cachedToken.expires_at - Date.now()) / 60000))
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 토큰 수동 갱신
app.post("/api/token/refresh", async (req, res) => {
  try {
    await getAccessToken(true);
    res.json({
      success: true,
      expiresAt: new Date(cachedToken.expires_at).toISOString()
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 기기 조회 테스트
app.post("/api/test/query", async (req, res) => {
  try {
    const { agentUserId } = req.body;
    if (!agentUserId) {
      return res.status(400).json({ error: "agentUserId가 필요합니다." });
    }
    const result = await queryDevices(agentUserId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// HomeGraph Request Sync
app.post("/api/homegraph/request-sync", async (req, res) => {
  try {
    const { agentUserId } = req.body;
    if (!agentUserId) {
      return res.status(400).json({ error: "agentUserId가 필요합니다." });
    }
    const token = await getAccessToken();
    const response = await fetch(
      "https://homegraph.googleapis.com/v1/devices:requestSync",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ agentUserId })
      }
    );
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Sync 요청 실패");
    }
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 사용자 OAuth API (glocaltokens) ==========

// 사용자 인증 상태 확인
app.get("/api/user-auth/status", (req, res) => {
  const userAuth = loadUserAuth();
  const glocalData = loadGlocalCache();

  if (!userAuth) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    username: userAuth.username,
    authenticatedAt: userAuth.authenticated_at,
    hasMasterToken: !!userAuth.master_token,
    cachedDevices: glocalData?.devices?.length || 0,
    lastFetch: glocalData?.fetched_at
  });
});

// 사용자 Google 계정 로그인
app.post("/api/user-auth/login", async (req, res) => {
  try {
    const { username, password, androidId } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "이메일과 비밀번호(앱 비밀번호)가 필요합니다." });
    }

    const result = await authenticateUser(username, password, androidId);
    res.json({
      success: true,
      username,
      message: "인증 성공! Master Token이 저장되었습니다."
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Master Token 직접 입력
app.post("/api/user-auth/set-token", (req, res) => {
  try {
    const { username, masterToken } = req.body;

    if (!username || !masterToken) {
      return res.status(400).json({ error: "이메일과 Master Token이 필요합니다." });
    }

    // master token 형식 검증 (aas_et/로 시작)
    if (!masterToken.startsWith("aas_et/")) {
      return res.status(400).json({ error: "유효하지 않은 Master Token 형식입니다. (aas_et/로 시작해야 함)" });
    }

    saveUserAuth({
      username,
      master_token: masterToken,
      authenticated_at: new Date().toISOString(),
      manual_input: true
    });

    console.log("✅ Master Token 수동 입력됨:", username);
    res.json({
      success: true,
      username,
      message: "Master Token이 저장되었습니다."
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 로그아웃 (인증 정보 삭제)
app.post("/api/user-auth/logout", (req, res) => {
  try {
    if (fs.existsSync(USER_AUTH_PATH)) {
      fs.unlinkSync(USER_AUTH_PATH);
    }
    if (fs.existsSync(GLOCAL_CACHE_PATH)) {
      fs.unlinkSync(GLOCAL_CACHE_PATH);
    }
    glocalCache = null;
    res.json({ success: true, message: "로그아웃되었습니다." });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Google Home 기기 자동 조회
app.get("/api/google-devices", async (req, res) => {
  try {
    const result = await fetchGoogleDevices();
    res.json({
      success: true,
      devices: result.devices,
      accessToken: result.access_token ? "ya29.***" : null // 토큰은 마스킹
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 캐시된 기기 조회 (API 호출 없이)
app.get("/api/google-devices/cached", (req, res) => {
  const cached = loadGlocalCache();
  if (!cached) {
    return res.json({ devices: [], cached: false });
  }
  res.json({
    devices: cached.devices,
    cached: true,
    fetchedAt: cached.fetched_at
  });
});

// glocaltokens 테스트
app.get("/api/glocaltokens/test", async (req, res) => {
  try {
    const result = await callGlocalBridge("test", {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ========== 디바이스 CRUD API ==========

// 디바이스 목록 조회
app.get("/api/devices", (req, res) => {
  const devices = loadDevices();
  res.json({ devices });
});

// 디바이스 추가
app.post("/api/devices", (req, res) => {
  try {
    const device = req.body;
    if (!device.id) {
      return res.status(400).json({ error: "디바이스 ID가 필요합니다." });
    }
    const devices = loadDevices();
    if (devices.find(d => d.id === device.id)) {
      return res.status(400).json({ error: "이미 존재하는 ID입니다." });
    }
    devices.push(device);
    saveDevices(devices);
    res.json({ success: true, device });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 디바이스 수정
app.put("/api/devices/:id", (req, res) => {
  try {
    const { id } = req.params;
    const device = req.body;
    const devices = loadDevices();
    const idx = devices.findIndex(d => d.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "디바이스를 찾을 수 없습니다." });
    }
    devices[idx] = { ...devices[idx], ...device, id };
    saveDevices(devices);
    res.json({ success: true, device: devices[idx] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 디바이스 삭제
app.delete("/api/devices/:id", (req, res) => {
  try {
    const { id } = req.params;
    const devices = loadDevices();
    const idx = devices.findIndex(d => d.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "디바이스를 찾을 수 없습니다." });
    }
    devices.splice(idx, 1);
    saveDevices(devices);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ========== MCP Tools API ==========
app.get("/api/tools", (req, res) => {
  res.json({
    tools: [
      {
        name: "list_google_home_devices",
        description: "연결된 Google Home 기기 목록을 조회합니다.",
        inputSchema: {
          type: "object",
          properties: {
            refresh: { type: "boolean", description: "캐시 무시하고 새로 조회" }
          }
        }
      },
      {
        name: "get_device_local_token",
        description: "특정 기기의 로컬 인증 토큰을 가져옵니다.",
        inputSchema: {
          type: "object",
          properties: {
            deviceName: { type: "string", description: "기기 이름" }
          },
          required: ["deviceName"]
        }
      },
      {
        name: "query_devices",
        description: "HomeGraph에서 기기 상태를 조회합니다. (Smart Home Action 전용)",
        inputSchema: {
          type: "object",
          properties: {
            agentUserId: { type: "string", description: "에이전트 사용자 ID" }
          },
          required: ["agentUserId"]
        }
      },
      {
        name: "sync_devices",
        description: "HomeGraph와 기기를 동기화합니다. (Smart Home Action 전용)",
        inputSchema: {
          type: "object",
          properties: {
            agentUserId: { type: "string", description: "에이전트 사용자 ID" }
          },
          required: ["agentUserId"]
        }
      },
      {
        name: "report_state",
        description: "기기 상태를 HomeGraph에 보고합니다. (Smart Home Action 전용)",
        inputSchema: {
          type: "object",
          properties: {
            agentUserId: { type: "string", description: "에이전트 사용자 ID" },
            deviceStates: { type: "object", description: "기기별 상태 객체" }
          },
          required: ["agentUserId", "deviceStates"]
        }
      }
    ]
  });
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
loadCachedToken();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🏠 Google Home MCP 서버: http://localhost:${PORT}`);
  console.log(`📡 MCP SSE: http://localhost:${PORT}/sse`);

  const sa = loadServiceAccount();
  if (sa) {
    console.log(`✅ 서비스 계정: ${sa.client_email}`);
  } else {
    console.log("⚠️  서비스 계정이 설정되지 않았습니다.");
  }
});
