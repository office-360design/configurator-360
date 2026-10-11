Option Explicit
Dim shell, fso, scriptsFolder, projectRoot
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptsFolder = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(scriptsFolder))
shell.Run "cmd /c cd /d """ & projectRoot & """ && npm run prepare:static", 0, True
shell.Run "explorer.exe """ & projectRoot & "\dist\site""", 1, False
