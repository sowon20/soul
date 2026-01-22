import { useState, useEffect } from 'react'
import {
  fetchUserAuthStatus,
  loginWithGoogle,
  logoutUser,
  fetchGoogleDevices,
  fetchCachedGoogleDevices,
  testGlocaltokens,
  setMasterToken
} from '../api/client'

export default function GoogleHomeDevices({ onError }) {
  const [authStatus, setAuthStatus] = useState(null)
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [loginForm, setLoginForm] = useState({ username: '', password: '', androidId: '' })
  const [showLogin, setShowLogin] = useState(false)
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [manualToken, setManualToken] = useState({ username: '', masterToken: '' })
  const [fetching, setFetching] = useState(false)
  const [bridgeStatus, setBridgeStatus] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [auth, cached, bridge] = await Promise.all([
        fetchUserAuthStatus(),
        fetchCachedGoogleDevices(),
        testGlocaltokens().catch(() => ({ success: false, error: 'Bridge not available' }))
      ])
      setAuthStatus(auth)
      setDevices(cached.devices || [])
      setBridgeStatus(bridge)
    } catch (e) {
      onError?.(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!loginForm.username || !loginForm.password) {
      onError?.('이메일과 비밀번호를 입력하세요.')
      return
    }

    try {
      setFetching(true)
      const result = await loginWithGoogle(
        loginForm.username,
        loginForm.password,
        loginForm.androidId || null
      )

      if (result.error) {
        throw new Error(result.error)
      }

      setShowLogin(false)
      setLoginForm({ username: '', password: '', androidId: '' })
      await loadData()
    } catch (e) {
      onError?.(e.message)
    } finally {
      setFetching(false)
    }
  }

  const handleLogout = async () => {
    if (!confirm('로그아웃하시겠습니까? 저장된 인증 정보가 삭제됩니다.')) return

    try {
      await logoutUser()
      setAuthStatus(null)
      setDevices([])
      await loadData()
    } catch (e) {
      onError?.(e.message)
    }
  }

  const handleFetchDevices = async () => {
    try {
      setFetching(true)
      const result = await fetchGoogleDevices()
      if (result.error) {
        throw new Error(result.error)
      }
      setDevices(result.devices || [])
    } catch (e) {
      onError?.(e.message)
    } finally {
      setFetching(false)
    }
  }

  const handleTokenSubmit = async (e) => {
    e.preventDefault()
    if (!manualToken.username || !manualToken.masterToken) {
      onError?.('이메일과 Master Token을 입력하세요.')
      return
    }

    try {
      setFetching(true)
      const result = await setMasterToken(manualToken.username, manualToken.masterToken)
      if (result.error) {
        throw new Error(result.error)
      }
      setShowTokenInput(false)
      setManualToken({ username: '', masterToken: '' })
      await loadData()
    } catch (e) {
      onError?.(e.message)
    } finally {
      setFetching(false)
    }
  }

  if (loading) {
    return <div className="text-gray-400">로딩 중...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Google Home 기기</h2>
        {authStatus?.authenticated && (
          <button
            onClick={handleFetchDevices}
            disabled={fetching}
            className="btn btn-primary"
          >
            {fetching ? '조회 중...' : '기기 새로고침'}
          </button>
        )}
      </div>

      {/* Bridge 상태 */}
      <div className={`card ${bridgeStatus?.success ? 'bg-green-900/20 border-green-700/50' : 'bg-red-900/20 border-red-700/50'}`}>
        <div className="flex items-center gap-3">
          <span className="text-xl">{bridgeStatus?.success ? '✅' : '❌'}</span>
          <div>
            <div className="font-medium text-white">glocaltokens Bridge</div>
            <p className="text-sm text-gray-400">
              {bridgeStatus?.success ? bridgeStatus.message : bridgeStatus?.error || 'Python bridge가 작동하지 않습니다.'}
            </p>
          </div>
        </div>
      </div>

      {/* 인증 상태 */}
      {authStatus?.authenticated ? (
        <div className="card bg-dark-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔐</span>
              <div>
                <div className="font-medium text-white">로그인됨</div>
                <p className="text-sm text-gray-400">{authStatus.username}</p>
                <p className="text-xs text-gray-500">
                  인증 시간: {new Date(authStatus.authenticatedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-danger text-sm">
              로그아웃
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          {!showLogin && !showTokenInput ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🔑</div>
              <div className="text-gray-400 mb-4">
                Google Home 기기를 조회하려면 인증이 필요합니다.
              </div>
              <div className="flex flex-col gap-3 max-w-xs mx-auto">
                <button onClick={() => setShowLogin(true)} className="btn btn-primary">
                  Google 계정 로그인
                </button>
                <button onClick={() => setShowTokenInput(true)} className="btn btn-secondary">
                  Master Token 직접 입력
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                로그인이 안 되면 Docker로 토큰을 받아서 직접 입력하세요.
              </p>
            </div>
          ) : showTokenInput ? (
            <form onSubmit={handleTokenSubmit} className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <span className="text-xl">💡</span>
                <div className="text-sm text-blue-400">
                  <strong>Master Token 획득 방법</strong>
                  <p className="mt-1 text-blue-500/80">
                    로컬에서 다음 명령어를 실행하세요:
                  </p>
                  <code className="block mt-2 p-2 bg-dark-900 rounded text-xs">
                    docker run --rm -it breph/ha-google-home_get-token
                  </code>
                </div>
              </div>

              <div>
                <label className="label">Google 이메일</label>
                <input
                  type="email"
                  value={manualToken.username}
                  onChange={(e) => setManualToken(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="example@gmail.com"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Master Token</label>
                <textarea
                  value={manualToken.masterToken}
                  onChange={(e) => setManualToken(prev => ({ ...prev, masterToken: e.target.value }))}
                  placeholder="aas_et/..."
                  className="input h-24 font-mono text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  aas_et/로 시작하는 토큰을 붙여넣으세요.
                </p>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={fetching} className="btn btn-primary flex-1">
                  {fetching ? '저장 중...' : '토큰 저장'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTokenInput(false)}
                  className="btn btn-secondary"
                >
                  취소
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                <span className="text-xl">⚠️</span>
                <div className="text-sm text-yellow-400">
                  <strong>앱 비밀번호 사용 권장</strong>
                  <p className="mt-1 text-yellow-500/80">
                    2단계 인증이 활성화된 경우 일반 비밀번호가 작동하지 않습니다.
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener"
                      className="text-yellow-400 underline ml-1"
                    >
                      앱 비밀번호 생성
                    </a>
                  </p>
                </div>
              </div>

              <div>
                <label className="label">Google 이메일</label>
                <input
                  type="email"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="example@gmail.com"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">비밀번호 (앱 비밀번호 권장)</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="앱 비밀번호 입력"
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Android ID (선택)</label>
                <input
                  type="text"
                  value={loginForm.androidId}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, androidId: e.target.value }))}
                  placeholder="예: 0123456789abcdef"
                  className="input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  16자리 hex 문자열. 비워두면 자동 생성됩니다.
                </p>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={fetching} className="btn btn-primary flex-1">
                  {fetching ? '로그인 중...' : '로그인'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogin(false)}
                  className="btn btn-secondary"
                >
                  취소
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* 기기 목록 */}
      {authStatus?.authenticated && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              기기 목록 ({devices.length}개)
            </h3>
            {authStatus.lastFetch && (
              <span className="text-xs text-gray-500">
                마지막 조회: {new Date(authStatus.lastFetch).toLocaleString()}
              </span>
            )}
          </div>

          {devices.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-4xl mb-4">📱</div>
              <div className="text-gray-400 mb-4">
                기기 목록이 없습니다. '기기 새로고침'을 클릭하여 조회하세요.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {devices.map((device, idx) => (
                <DeviceCard key={device.device_name || idx} device={device} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DeviceCard({ device }) {
  const [showToken, setShowToken] = useState(false)

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <span className="text-2xl">
          {device.hardware?.includes('speaker') ? '🔊' :
           device.hardware?.includes('display') ? '📺' :
           device.hardware?.includes('chromecast') ? '📡' : '📱'}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-white truncate">
            {device.device_name || '이름 없음'}
          </h4>
          <p className="text-sm text-gray-400">{device.hardware || 'Unknown'}</p>

          {device.ip && (
            <p className="text-xs text-gray-500 mt-1">IP: {device.ip}</p>
          )}

          {device.local_auth_token && (
            <div className="mt-2">
              <button
                onClick={() => setShowToken(!showToken)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {showToken ? '토큰 숨기기' : '로컬 토큰 보기'}
              </button>
              {showToken && (
                <div className="mt-1 p-2 bg-dark-900 rounded text-xs font-mono text-gray-400 break-all">
                  {device.local_auth_token.substring(0, 50)}...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
