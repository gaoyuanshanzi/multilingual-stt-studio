
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut('C:\Users\현충식\Desktop\AI 다국어 음성인식 스튜디오.lnk')
$s.TargetPath = 'wscript.exe'
$s.Arguments = '"d:\antigravityhyunssttfile\launch_silent.vbs"'
$s.WorkingDirectory = 'd:\antigravityhyunssttfile'
$s.WindowStyle = 1
$s.Description = 'AI 다국어 음성인식 스튜디오 - Chrome 원클릭 실행'
$s.IconLocation = 'C:\Program Files\Google\Chrome\Application\chrome.exe,0'
$s.Save()
Write-Host 'Shortcut updated successfully.'
