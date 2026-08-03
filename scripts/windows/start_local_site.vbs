Option Explicit
Dim shell, fso, scriptsFolder, projectRoot
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptsFolder = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptsFolder))
shell.Run "cmd /c cd /d """ & projectRoot & """ && npm start", 0, False
WScript.Sleep 1500
shell.Run "http://localhost:3000", 1, False
