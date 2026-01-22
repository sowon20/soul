const API_BASE = '/api'

// 상태 조회
export async function fetchStatus() {
  const [serviceAccount, token] = await Promise.all([
    fetch(`${API_BASE}/service-account/status`).then(r => r.json()),
    fetch(`${API_BASE}/token/status`).then(r => r.json())
  ])

  return {
    serviceAccount,
    token,
    mcpRunning: true, // 서버가 응답하면 running
    lastCheck: new Date().toISOString()
  }
}

// HomeGraph Sync 요청
export async function requestSync(agentUserId) {
  const res = await fetch(`${API_BASE}/homegraph/request-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentUserId })
  })
  return res.json()
}

// 디바이스 목록 조회
export async function fetchDevices() {
  const res = await fetch(`${API_BASE}/devices`)
  return res.json()
}

// 디바이스 추가
export async function createDevice(device) {
  const res = await fetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device)
  })
  return res.json()
}

// 디바이스 수정
export async function updateDevice(id, device) {
  const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device)
  })
  return res.json()
}

// 디바이스 삭제
export async function deleteDevice(id) {
  const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
  return res.json()
}

// MCP Tools 조회
export async function fetchTools() {
  const res = await fetch(`${API_BASE}/tools`)
  return res.json()
}

// 서비스 계정 업로드
export async function uploadServiceAccount(serviceAccount) {
  const res = await fetch(`${API_BASE}/service-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceAccount })
  })
  return res.json()
}

// 토큰 갱신
export async function refreshToken() {
  const res = await fetch(`${API_BASE}/token/refresh`, {
    method: 'POST'
  })
  return res.json()
}

// ========== 사용자 OAuth (glocaltokens) ==========

// 사용자 인증 상태 확인
export async function fetchUserAuthStatus() {
  const res = await fetch(`${API_BASE}/user-auth/status`)
  return res.json()
}

// 사용자 Google 계정 로그인
export async function loginWithGoogle(username, password, androidId = null) {
  const res = await fetch(`${API_BASE}/user-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, androidId })
  })
  return res.json()
}

// 로그아웃
export async function logoutUser() {
  const res = await fetch(`${API_BASE}/user-auth/logout`, {
    method: 'POST'
  })
  return res.json()
}

// Master Token 직접 입력
export async function setMasterToken(username, masterToken) {
  const res = await fetch(`${API_BASE}/user-auth/set-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, masterToken })
  })
  return res.json()
}

// Google Home 기기 자동 조회
export async function fetchGoogleDevices() {
  const res = await fetch(`${API_BASE}/google-devices`)
  return res.json()
}

// 캐시된 기기 조회
export async function fetchCachedGoogleDevices() {
  const res = await fetch(`${API_BASE}/google-devices/cached`)
  return res.json()
}

// glocaltokens 테스트
export async function testGlocaltokens() {
  const res = await fetch(`${API_BASE}/glocaltokens/test`)
  return res.json()
}

// 자동화 규칙 (로컬 스토리지)
export function getAutomationRules() {
  const stored = localStorage.getItem('automation_rules')
  return stored ? JSON.parse(stored) : []
}

export function saveAutomationRules(rules) {
  localStorage.setItem('automation_rules', JSON.stringify(rules))
}
