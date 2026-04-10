import type { CSSProperties, FC } from 'react'
import type { SwarmVisionWidgetConfig } from '@swarmvision/shared-types'

function buildWidgetUrl(config: SwarmVisionWidgetConfig): string {
  const url = new URL(config.baseUrl)
  url.searchParams.set('embed', '1')
  url.searchParams.set('mode', config.mode ?? 'live')
  if (config.tenantId) url.searchParams.set('tenant_id', config.tenantId)
  if (config.appId) url.searchParams.set('app_id', config.appId)
  if (config.appName) url.searchParams.set('app_name', config.appName)
  if (config.environment) url.searchParams.set('environment', config.environment)
  if (config.version) url.searchParams.set('version', config.version)
  if (config.theme) url.searchParams.set('theme', config.theme)
  return url.toString()
}

export interface SwarmVisionWidgetProps extends SwarmVisionWidgetConfig {
  className?: string
  style?: CSSProperties
}

export const SwarmVisionWidget: FC<SwarmVisionWidgetProps> = ({
  width = '100%',
  height = 420,
  className,
  style,
  ...config
}) => (
  <iframe
    title="SwarmVision Widget"
    src={buildWidgetUrl(config)}
    className={className}
    style={{
      width,
      height,
      border: '1px solid rgba(148, 163, 184, 0.22)',
      borderRadius: 14,
      background: '#020617',
      ...style,
    }}
  />
)

export function mountSwarmVisionWidget(
  element: HTMLElement,
  config: SwarmVisionWidgetConfig
): HTMLIFrameElement {
  const iframe = document.createElement('iframe')
  iframe.title = 'SwarmVision Widget'
  iframe.src = buildWidgetUrl(config)
  iframe.style.width = typeof config.width === 'number' ? `${config.width}px` : config.width ?? '100%'
  iframe.style.height =
    typeof config.height === 'number' ? `${config.height}px` : config.height ?? '420px'
  iframe.style.border = '1px solid rgba(148, 163, 184, 0.22)'
  iframe.style.borderRadius = '14px'
  iframe.style.background = '#020617'
  element.replaceChildren(iframe)
  return iframe
}
