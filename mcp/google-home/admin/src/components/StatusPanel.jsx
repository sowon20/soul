export default function StatusPanel({ status, errors }) {
  const isServiceAccountOk = status?.serviceAccount?.configured
  const isTokenOk = status?.token?.hasToken && !status?.token?.expired
  const isMcpRunning = status?.mcpRunning

  return (
    <header className="bg-dark-800 border-b border-dark-600 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* 상태 표시 */}
        <div className="flex items-center gap-6">
          {/* MCP 서버 상태 */}
          <StatusBadge
            label="MCP 서버"
            ok={isMcpRunning}
            detail={isMcpRunning ? 'Running' : 'Stopped'}
          />

          {/* Google API 인증 */}
          <StatusBadge
            label="Google API"
            ok={isServiceAccountOk && isTokenOk}
            detail={
              !isServiceAccountOk
                ? '서비스 계정 없음'
                : !isTokenOk
                ? '토큰 만료'
                : `${status?.token?.remainingMinutes}분 남음`
            }
          />

          {/* 마지막 체크 */}
          {status?.lastCheck && (
            <div className="text-xs text-gray-500">
              마지막 확인: {new Date(status.lastCheck).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* 에러 로그 */}
        {errors.length > 0 && (
          <div className="relative group">
            <button className="badge badge-error flex items-center gap-1">
              <span>⚠️</span>
              <span>에러 {errors.length}개</span>
            </button>

            {/* 에러 목록 팝업 */}
            <div className="absolute right-0 top-full mt-2 w-80 bg-dark-900 border border-dark-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="p-3 border-b border-dark-600 text-sm font-medium text-gray-300">
                최근 에러 로그
              </div>
              <div className="max-h-60 overflow-y-auto">
                {errors.map(error => (
                  <div key={error.id} className="p-3 border-b border-dark-700 last:border-b-0">
                    <div className="text-xs text-gray-500 mb-1">{error.time}</div>
                    <div className="text-sm text-red-400">{error.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

function StatusBadge({ label, ok, detail }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <div>
        <div className="text-sm font-medium text-gray-200">{label}</div>
        <div className={`text-xs ${ok ? 'text-green-400' : 'text-red-400'}`}>{detail}</div>
      </div>
    </div>
  )
}
