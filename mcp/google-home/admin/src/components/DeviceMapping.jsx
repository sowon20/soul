import { useState } from 'react'
import { createDevice, updateDevice, deleteDevice } from '../api/client'

const DEVICE_TYPES = [
  { value: 'action.devices.types.BOILER', label: '보일러' },
  { value: 'action.devices.types.LIGHT', label: '조명' },
  { value: 'action.devices.types.SWITCH', label: '스위치' },
  { value: 'action.devices.types.THERMOSTAT', label: '온도조절기' },
  { value: 'action.devices.types.SENSOR', label: '센서' },
  { value: 'action.devices.types.FAN', label: '팬' },
  { value: 'action.devices.types.AC_UNIT', label: '에어컨' },
  { value: 'action.devices.types.OUTLET', label: '콘센트' },
]

const TRAITS = [
  { value: 'action.devices.traits.OnOff', label: 'OnOff' },
  { value: 'action.devices.traits.Brightness', label: 'Brightness' },
  { value: 'action.devices.traits.ColorSetting', label: 'ColorSetting' },
  { value: 'action.devices.traits.TemperatureSetting', label: 'TemperatureSetting' },
  { value: 'action.devices.traits.TemperatureControl', label: 'TemperatureControl' },
  { value: 'action.devices.traits.FanSpeed', label: 'FanSpeed' },
  { value: 'action.devices.traits.Modes', label: 'Modes' },
  { value: 'action.devices.traits.Toggles', label: 'Toggles' },
]

export default function DeviceMapping({ devices, onRefresh, onError }) {
  const [editingDevice, setEditingDevice] = useState(null)
  const [isAdding, setIsAdding] = useState(false)

  const emptyDevice = {
    id: '',
    googleDeviceId: '',
    name: '',
    type: 'action.devices.types.LIGHT',
    traits: [],
    roomHint: '',
  }

  const handleSave = async (device) => {
    try {
      if (isAdding) {
        const result = await createDevice(device)
        if (result.error) throw new Error(result.error)
      } else {
        const result = await updateDevice(device.id, device)
        if (result.error) throw new Error(result.error)
      }
      setEditingDevice(null)
      setIsAdding(false)
      onRefresh()
    } catch (e) {
      onError(e.message)
      alert('저장 실패: ' + e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      const result = await deleteDevice(id)
      if (result.error) throw new Error(result.error)
      onRefresh()
    } catch (e) {
      onError(e.message)
      alert('삭제 실패: ' + e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">디바이스 매핑</h2>
        <button
          onClick={() => {
            setEditingDevice(emptyDevice)
            setIsAdding(true)
          }}
          className="btn btn-primary"
        >
          + 디바이스 추가
        </button>
      </div>

      {/* 디바이스 목록 */}
      <div className="grid gap-4">
        {devices.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-4">📱</div>
            <div className="text-gray-400">등록된 디바이스가 없습니다.</div>
            <button
              onClick={() => {
                setEditingDevice(emptyDevice)
                setIsAdding(true)
              }}
              className="btn btn-secondary mt-4"
            >
              첫 디바이스 추가하기
            </button>
          </div>
        ) : (
          devices.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              onEdit={() => {
                setEditingDevice(device)
                setIsAdding(false)
              }}
              onDelete={() => handleDelete(device.id)}
            />
          ))
        )}
      </div>

      {/* 편집 모달 */}
      {editingDevice && (
        <DeviceEditModal
          device={editingDevice}
          isNew={isAdding}
          onSave={handleSave}
          onClose={() => {
            setEditingDevice(null)
            setIsAdding(false)
          }}
        />
      )}
    </div>
  )
}

function DeviceCard({ device, onEdit, onDelete }) {
  const typeLabel = DEVICE_TYPES.find(t => t.value === device.type)?.label || device.type

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{getDeviceIcon(device.type)}</span>
            <div>
              <h3 className="font-semibold text-white">{device.name || device.id}</h3>
              <span className="text-sm text-gray-500">{typeLabel}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mt-4">
            <div>
              <span className="text-gray-500">내부 ID:</span>
              <span className="ml-2 text-gray-300 font-mono">{device.id}</span>
            </div>
            <div>
              <span className="text-gray-500">Google ID:</span>
              <span className="ml-2 text-gray-300 font-mono">{device.googleDeviceId || '-'}</span>
            </div>
            {device.roomHint && (
              <div>
                <span className="text-gray-500">위치:</span>
                <span className="ml-2 text-gray-300">{device.roomHint}</span>
              </div>
            )}
          </div>

          {/* Traits */}
          <div className="mt-4 flex flex-wrap gap-2">
            {device.traits?.map(trait => (
              <span key={trait} className="badge badge-info">
                {trait.split('.').pop()}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onEdit} className="btn btn-secondary text-sm">
            수정
          </button>
          <button onClick={onDelete} className="btn btn-danger text-sm">
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

function DeviceEditModal({ device, isNew, onSave, onClose }) {
  const [form, setForm] = useState(device)

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleTraitToggle = (trait) => {
    setForm(prev => ({
      ...prev,
      traits: prev.traits.includes(trait)
        ? prev.traits.filter(t => t !== trait)
        : [...prev.traits, trait]
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.id) {
      alert('내부 ID를 입력하세요.')
      return
    }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-800 border border-dark-600 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-dark-600">
          <h3 className="text-xl font-bold text-white">
            {isNew ? '디바이스 추가' : '디바이스 수정'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">내부 Device ID *</label>
            <input
              type="text"
              value={form.id}
              onChange={(e) => handleChange('id', e.target.value)}
              placeholder="예: boiler-1"
              className="input"
              disabled={!isNew}
            />
          </div>

          <div>
            <label className="label">Google Home Device ID</label>
            <input
              type="text"
              value={form.googleDeviceId}
              onChange={(e) => handleChange('googleDeviceId', e.target.value)}
              placeholder="Google에서 할당한 ID"
              className="input"
            />
          </div>

          <div>
            <label className="label">이름</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="거실 보일러"
              className="input"
            />
          </div>

          <div>
            <label className="label">디바이스 타입</label>
            <select
              value={form.type}
              onChange={(e) => handleChange('type', e.target.value)}
              className="input"
            >
              {DEVICE_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">위치 (Room Hint)</label>
            <input
              type="text"
              value={form.roomHint}
              onChange={(e) => handleChange('roomHint', e.target.value)}
              placeholder="거실, 안방, 주방 등"
              className="input"
            />
          </div>

          <div>
            <label className="label">Traits</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {TRAITS.map(trait => (
                <label
                  key={trait.value}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer border ${
                    form.traits.includes(trait.value)
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-dark-600 hover:border-dark-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.traits.includes(trait.value)}
                    onChange={() => handleTraitToggle(trait.value)}
                    className="sr-only"
                  />
                  <span className={form.traits.includes(trait.value) ? 'text-blue-400' : 'text-gray-400'}>
                    {trait.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn btn-primary flex-1">
              저장
            </button>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function getDeviceIcon(type) {
  const icons = {
    'action.devices.types.BOILER': '🔥',
    'action.devices.types.LIGHT': '💡',
    'action.devices.types.SWITCH': '🔘',
    'action.devices.types.THERMOSTAT': '🌡️',
    'action.devices.types.SENSOR': '📡',
    'action.devices.types.FAN': '🌀',
    'action.devices.types.AC_UNIT': '❄️',
    'action.devices.types.OUTLET': '🔌',
  }
  return icons[type] || '📱'
}
