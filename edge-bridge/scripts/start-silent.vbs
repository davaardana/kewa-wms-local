' MOSA WMS - Silent Background Auto-Start Script for Windows Startup
' Place a shortcut to this file in: shell:startup
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
BatPath = Chr(34) & ScriptDir & "\mosa-gate-bridge.bat" & Chr(34)
' 0 = Hide window (runs completely in background)
WshShell.Run BatPath, 0, False
Set WshShell = Nothing
Set FSO = Nothing
