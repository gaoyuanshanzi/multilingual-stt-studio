
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('C:\Users\현충식\Desktop\AI 다국어 음성인식 스튜디오.lnk')
$Shortcut.TargetPath = 'wscript.exe'
$Shortcut.Arguments = '"d:\antigravityhyunssttfile\launch_silent.vbs"'
$Shortcut.WorkingDirectory = 'd:\antigravityhyunssttfile'
$Shortcut.WindowStyle = 1
$Shortcut.Description = 'AI 다국어 음성인식 & Neon DB 스튜디오 원클릭 실행'
# Use shell32.dll audio icon index 168 or 116 (microphone/sound)
$Shortcut.IconLocation = '%SystemRoot%\System32\shell32.dll, 168'
$Shortcut.Save()
Write-Host "Shortcut created at: C:\Users\현충식\Desktop\AI 다국어 음성인식 스튜디오.lnk"
