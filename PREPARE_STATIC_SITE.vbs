Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c cd /d """ & folder & """ && node prepare_static_site.js", 0, True
shell.Run "explorer.exe """ & folder & "\static-site""", 1, False
