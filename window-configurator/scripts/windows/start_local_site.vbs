Option Explicit

Dim shell, fso, scriptsFolder, projectRoot, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptsFolder = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName( _
    fso.GetParentFolderName(scriptsFolder) _
)

command = "cmd /k cd /d """ & projectRoot & """ && npm start"

' 1 = show the command window.
' /k = keep it open so startup errors remain visible.
shell.Run command, 1, False