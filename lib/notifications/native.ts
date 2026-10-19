import { execFile } from 'node:child_process'

export function nativeNotificationsSupported(): boolean {
  return process.platform === 'win32'
}

/**
 * Windows toast for the local scheduler fallback. Web push cannot display while
 * the browser process is closed, so the scheduler asks the cron route to deliver
 * natively in that case. Values go through the environment, never into the
 * PowerShell script, so reminder text cannot alter the command.
 */
export async function showWindowsToast(title: string, body: string): Promise<void> {
  if (!nativeNotificationsSupported()) {
    throw new Error('Native notifications are only supported on Windows.')
  }

  const script = String.raw`
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $template.GetElementsByTagName("text")
$texts.Item(0).AppendChild($template.CreateTextNode($env:LAT_TOAST_TITLE)) | Out-Null
$texts.Item(1).AppendChild($template.CreateTextNode($env:LAT_TOAST_BODY)) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($template)
$aumid = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($aumid).Show($toast)
`

  await new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        timeout: 10_000,
        windowsHide: true,
        env: {
          ...process.env,
          LAT_TOAST_TITLE: title.slice(0, 64),
          LAT_TOAST_BODY: body.slice(0, 256),
        },
      },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr.trim() || err.message))
          return
        }
        resolve()
      }
    )
  })
}
