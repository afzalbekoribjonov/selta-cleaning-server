import { useEffect, useState } from 'react'
import { subscribeAttendanceConfig, DEFAULT_ATTENDANCE_CONFIG, type AttendanceConfig } from '@/lib/attendance'

export function useAttendanceConfig() {
  const [config, setConfig] = useState<AttendanceConfig | null>(null)

  useEffect(() => {
    return subscribeAttendanceConfig(setConfig)
  }, [])

  return { config: config ?? DEFAULT_ATTENDANCE_CONFIG, loading: config === null }
}
