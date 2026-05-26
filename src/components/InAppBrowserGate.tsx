import { useState } from 'react'
import { bypassInAppGate } from '../utils/inAppBrowser'

interface InAppBrowserGateProps {
  onBypass: () => void
}

export default function InAppBrowserGate({ onBypass }: InAppBrowserGateProps) {
  const [copied, setCopied] = useState(false)
  const url = window.location.href

  const isIOS = /(iPhone|iPad|iPod)/.test(navigator.userAgent)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleBypass = () => {
    bypassInAppGate()
    onBypass()
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center px-6 py-10"
         style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">ATTUNE</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">A coach in your pocket</p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-5">
          <div>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Open in Safari to sign in</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              You're viewing this in an in-app browser (probably Gmail). Google blocks sign-in here for security, so we need to switch to a real browser.
            </p>
          </div>

          {isIOS ? (
            <ol className="text-sm text-slate-700 dark:text-slate-200 space-y-2 list-decimal pl-5">
              <li>Tap the <strong>⋯</strong> or <strong>share</strong> icon (top right or bottom).</li>
              <li>Choose <strong>Open in Safari</strong>.</li>
            </ol>
          ) : (
            <ol className="text-sm text-slate-700 dark:text-slate-200 space-y-2 list-decimal pl-5">
              <li>Tap the <strong>⋮</strong> menu in the top right.</li>
              <li>Choose <strong>Open in Chrome</strong> (or your default browser).</li>
            </ol>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Or copy the link and paste it into your browser:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                className="flex-1 text-xs bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={handleCopy}
                className="text-xs font-semibold text-teal-600 dark:text-teal-400 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-900/30 whitespace-nowrap"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleBypass}
          className="w-full text-xs text-slate-400 dark:text-slate-500 underline"
        >
          I'm already in a real browser — continue anyway
        </button>
      </div>
    </div>
  )
}
