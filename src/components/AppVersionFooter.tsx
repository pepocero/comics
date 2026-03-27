import { APP_VERSION, BUILD_ID } from '../lib/appVersion'

export function AppVersionFooter() {
  return (
    <p className="muted app-version-footer" title={`Build ${BUILD_ID}`}>
      Versión {APP_VERSION} · {BUILD_ID}
    </p>
  )
}
