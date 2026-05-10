const BYPASS_KEY = 'ba_inapp_bypass'

export function isInAppBrowser(userAgent: string = navigator.userAgent): boolean {
  if (/; wv\)/.test(userAgent)) return true
  if (/(iPhone|iPad|iPod)/.test(userAgent) && !/Safari\//.test(userAgent)) return true
  if (/(FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|LinkedInApp|GSA\/)/.test(userAgent)) return true
  return false
}

export function bypassInAppGate(): void {
  try { sessionStorage.setItem(BYPASS_KEY, '1') } catch { /* ignore */ }
}

export function isBypassed(): boolean {
  try { return sessionStorage.getItem(BYPASS_KEY) === '1' } catch { return false }
}
