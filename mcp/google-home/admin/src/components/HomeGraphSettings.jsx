import { useState, useRef } from 'react'
import { uploadServiceAccount, refreshToken, requestSync } from '../api/client'

export default function HomeGraphSettings({ status, onRefresh, onError }) {
  const [agentUserId, setAgentUserId] = useState(localStorage.getItem('agentUserId') || '')
  const [lastSyncTime, setLastSyncTime] = useState(localStorage.getItem('lastSyncTime'))
  const [syncing, setSyncing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleAgentUserIdChange = (e) => {
    const value = e.target.value
    setAgentUserId(value)
    localStorage.setItem('agentUserId', value)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)
    try {
      const text = await file.text()
      const serviceAccount = JSON.parse(text)
      const result = await uploadServiceAccount(serviceAccount)

      if (result.error) {
        throw new Error(result.error)
      }

      alert(`서비스 계정 등록 완료!\n이메일: ${result.email}`)
      onRefresh()
    } catch (e) {
      onError(e.message)
      alert('서비스 계정 등록 실패: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleRefreshToken = async () => {
    try {
      const result = await refreshToken()
      if (result.error) {
        throw new Error(result.error)
      }
      alert('토큰 갱신 완료!')
      onRefresh()
    } catch (e) {
      onError(e.message)
      alert('토큰 갱신 실패: ' + e.message)
    }
  }

  const handleRequestSync = async () => {
    if (!agentUserId) {
      alert('Agent User ID를 입력하세요.')
      return
    }

    setSyncing(true)
    try {
      const result = await requestSync(agentUserId)
      if (result.error) {
        throw new Error(result.error)
      }
      const now = new Date().toISOString()
      setLastSyncTime(now)
      localStorage.setItem('lastSyncTime', now)
      alert('Sync 요청 완료!')
    } catch (e) {
      onError(e.message)
      alert('Sync 요청 실패: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  const sa = status?.serviceAccount
  const token = status?.token

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">HomeGraph 설정</h2>

      {/* 서비스 계정 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>🔑</span>
          <span>서비스 계정</span>
        </h3>

        {sa?.configured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="badge badge-success">✓ 연결됨</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">이메일:</span>
                <span className="ml-2 text-gray-300">{sa.email}</span>
              </div>
              <div>
                <span className="text-gray-500">프로젝트:</span>
                <span className="ml-2 text-gray-300">{sa.projectId}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="text-gray-500 mb-4">서비스 계정이 설정되지 않았습니다.</div>
          </div>
        )}

        <div className="mt-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-secondary"
          >
            {uploading ? '업로드 중...' : '📁 서비스 계정 JSON 업로드'}
          </button>
        </div>
      </div>

      {/* 토큰 상태 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>🎫</span>
          <span>토큰 상태</span>
        </h3>

        {token?.hasToken ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {token.expired ? (
                <span className="badge badge-error">✗ 만료됨</span>
              ) : (
                <span className="badge badge-success">✓ 유효</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">만료 시간:</span>
                <span className="ml-2 text-gray-300">
                  {new Date(token.expiresAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">남은 시간:</span>
                <span className="ml-2 text-gray-300">{token.remainingMinutes}분</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">토큰이 없습니다.</div>
        )}

        <div className="mt-4">
          <button onClick={handleRefreshToken} className="btn btn-primary">
            🔄 토큰 갱신
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          토큰은 1시간 유효하며, 만료 5분 전에 자동으로 갱신됩니다.
        </p>
      </div>

      {/* Agent User ID & Sync */}
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>🔄</span>
          <span>Request Sync</span>
        </h3>

        <div className="space-y-4">
          <div>
            <label className="label">Agent User ID</label>
            <input
              type="text"
              value={agentUserId}
              onChange={handleAgentUserIdChange}
              placeholder="예: user123"
              className="input"
            />
            <p className="text-xs text-gray-500 mt-1">
              Smart Home Action에서 사용자를 식별하는 ID입니다.
            </p>
          </div>

          {lastSyncTime && (
            <div className="text-sm text-gray-400">
              마지막 Sync: {new Date(lastSyncTime).toLocaleString()}
            </div>
          )}

          <button
            onClick={handleRequestSync}
            disabled={syncing || !sa?.configured}
            className="btn btn-success"
          >
            {syncing ? 'Sync 중...' : '📤 Request Sync'}
          </button>
        </div>
      </div>
    </div>
  )
}
