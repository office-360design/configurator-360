Option Explicit
Dim shell, fso, folder
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c cd /d """ & folder & """ && node server.js", 0, False
WScript.Sleep 1500
shell.Run "http://localhost:3000", 1, False
