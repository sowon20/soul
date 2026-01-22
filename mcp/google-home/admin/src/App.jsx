import { useState, useEffect } from 'react'
import './index.css'
import Sidebar from './components/Sidebar'
import StatusPanel from './components/StatusPanel'
import HomeGraphSettings from './components/HomeGraphSettings'
import DeviceMapping from './components/DeviceMapping'
import McpToolSettings from './components/McpToolSettings'
import AutomationRules from './components/AutomationRules'
import GoogleHomeDevices from './components/GoogleHomeDevices'
import { fetchStatus, fetchDevices, fetchTools } from './api/client'

function App() {
  const [activeSection, setActiveSection] = useState('google-home')
  const [status, setStatus] = useState(null)
  const [devices, setDevices] = useState([])
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])

  // 상태 로드
  useEffect(() => {
    loadAllData()
    const interval = setInterval(loadAllData, 30000) // 30초마다 갱신
    return () => clearInterval(interval)
  }, [])

  const loadAllData = async () => {
    try {
      const [statusData, devicesData, toolsData] = await Promise.all([
        fetchStatus(),
        fetchDevices(),
        fetchTools()
      ])
      setStatus(statusData)
      setDevices(devicesData.devices || [])
      setTools(toolsData.tools || [])
      setLoading(false)
    } catch (e) {
      addError(e.message)
      setLoading(false)
    }
  }

  const addError = (message) => {
    setErrors(prev => [
      { id: Date.now(), message, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 4)
    ])
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'google-home':
        return <GoogleHomeDevices onError={addError} />
      case 'homegraph':
        return <HomeGraphSettings status={status} onRefresh={loadAllData} onError={addError} />
      case 'devices':
        return <DeviceMapping devices={devices} onRefresh={loadAllData} onError={addError} />
      case 'tools':
        return <McpToolSettings tools={tools} devices={devices} onRefresh={loadAllData} onError={addError} />
      case 'automation':
        return <AutomationRules devices={devices} tools={tools} onError={addError} />
      default:
        return <GoogleHomeDevices onError={addError} />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col">
        {/* 상단 상태 패널 */}
        <StatusPanel status={status} errors={errors} />

        {/* 메인 컨텐츠 */}
        <main className="flex-1 p-6 overflow-auto">
          {renderSection()}
        </main>
      </div>
    </div>
  )
}

export default App
