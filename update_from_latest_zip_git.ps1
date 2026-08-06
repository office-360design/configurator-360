[CmdletBinding()]
param(
    [string]$DestinationFolder
)

$ErrorActionPreference = "Stop"

# ============================================================================
# USER SETTINGS
# ============================================================================

# Full path of the script to run after the ZIP folder has been replaced.
# Supported: .ps1, .bat, .cmd, .vbs, .py and .exe.
$PostUpdateScript = "pergola-configurator/start_local_site.cmd"

# Git branch to use.
$Branch = "pergola"

# Usually "origin".
$Remote = "origin"

# Set to $true if the branch should be created when it does not exist.
$CreateBranchIfMissing = $false

# Set to $false to create the commit without pushing it.
$PushAfterCommit = $true

# Optional manual commit-message file in the repository root.
# Leave it blank to use the automatic message.
$CommitMessageFileName = "pergola-configurator/commit_message.md"

# Clear a manually supplied message after a successful commit.
$ClearManualMessageAfterCommit = $true

# Prevent accidental inclusion of unrelated unfinished work in `git add .`.
$RequireCleanWorkingTree = $true

# ============================================================================
# END USER SETTINGS
# ============================================================================

function Write-Step {
    param([string]$Message)
    Write-Host "[UPDATE] $Message"
}

function Get-DownloadsFolder {
    $key = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
    $name = "{374DE290-123F-4565-9164-39C4925E467B}"

    try {
        $raw = (Get-ItemProperty -LiteralPath $key -Name $name).$name
        $expanded = [Environment]::ExpandEnvironmentVariables($raw)

        if (-not [string]::IsNullOrWhiteSpace($expanded) -and
            (Test-Path -LiteralPath $expanded -PathType Container)) {
            return $expanded
        }
    }
    catch {
        # Fall back to the standard Downloads path.
    }

    return (Join-Path $env:USERPROFILE "Downloads")
}

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Repository,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [switch]$AllowFailure
    )

    $output = @(& git -C $Repository @Arguments 2>&1)
    $code = $LASTEXITCODE

    if (-not $AllowFailure -and $code -ne 0) {
        $details = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
        throw "git $($Arguments -join ' ') failed with exit code $code.`n$details"
    }

    return [PSCustomObject]@{
        ExitCode = $code
        Output = $output
    }
}

function Add-LocalGitExclusions {
    param(
        [string]$Repository,
        [string[]]$Entries
    )

    $excludeFile = Join-Path $Repository ".git\info\exclude"
    $excludeDirectory = Split-Path -Parent $excludeFile

    if (-not (Test-Path -LiteralPath $excludeDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $excludeDirectory -Force | Out-Null
    }

    if (-not (Test-Path -LiteralPath $excludeFile -PathType Leaf)) {
        New-Item -ItemType File -Path $excludeFile -Force | Out-Null
    }

    $existing = @(Get-Content -LiteralPath $excludeFile -ErrorAction SilentlyContinue)

    foreach ($entry in $Entries) {
        if ($existing -notcontains $entry) {
            Add-Content -LiteralPath $excludeFile -Value $entry
            $existing += $entry
        }
    }
}

function Write-CommitMessageTemplate {
    param([string]$Path)

    @"
<!--
Optional manual commit message.

Write the commit subject on the first non-empty line outside this comment.
Leave the file otherwise blank to use an automatically generated message.
-->
"@ | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-ManualCommitMessage {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    $insideComment = $false

    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()

        if ($insideComment) {
            if ($line -match "-->") {
                $insideComment = $false
            }
            continue
        }

        if ($line -match "^<!--") {
            if ($line -notmatch "-->") {
                $insideComment = $true
            }
            continue
        }

        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        # Both "Update project" and "# Update project" are accepted.
        $line = $line -replace "^#+\s*", ""

        if (-not [string]::IsNullOrWhiteSpace($line)) {
            return $line
        }
    }

    return $null
}

function Get-AutomaticCommitMessage {
    param(
        [string]$Repository,
        [string]$InstalledFolderName
    )

    $result = Invoke-Git -Repository $Repository -Arguments @(
        "diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"
    )

    $paths = @(
        $result.Output |
        ForEach-Object { $_.ToString().Trim().Replace("\", "/") } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )

    if ($paths.Count -eq 0) {
        return "Update project files"
    }

    $prefix = "$InstalledFolderName/"
    $outside = @(
        $paths | Where-Object {
            $_ -ne $InstalledFolderName -and
            -not $_.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
        }
    )

    if ($outside.Count -gt 0) {
        return "Update $InstalledFolderName and generated files"
    }

    return "Update $InstalledFolderName from latest ZIP"
}

function Invoke-ConfiguredScript {
    param(
        [string]$Path,
        [string]$WorkingDirectory
    )

    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -like "*CHANGE_ME*") {
        throw "Set `$PostUpdateScript in the USER SETTINGS section."
    }

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Post-update script not found: $Path"
    }

    $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()

    Push-Location -LiteralPath $WorkingDirectory
    try {
        switch ($extension) {
            ".ps1" { & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $Path }
            ".bat" { & cmd.exe /d /c "`"$Path`"" }
            ".cmd" { & cmd.exe /d /c "`"$Path`"" }
            ".vbs" { & cscript.exe //nologo $Path }
            ".py"  { & py.exe $Path }
            default { & $Path }
        }

        $code = $LASTEXITCODE
        if ($null -eq $code) {
            $code = 0
        }

        if ($code -ne 0) {
            throw "Post-update script exited with code $code."
        }
    }
    finally {
        Pop-Location
    }
}

function Switch-ToBranch {
    param(
        [string]$Repository,
        [string]$BranchName,
        [string]$RemoteName,
        [bool]$AllowCreate
    )

    if ([string]::IsNullOrWhiteSpace($BranchName) -or $BranchName -eq "CHANGE_ME") {
        throw "Set `$Branch in the USER SETTINGS section."
    }

    $currentResult = Invoke-Git -Repository $Repository -Arguments @("branch", "--show-current")
    $current = ""

    if ($currentResult.Output.Count -gt 0) {
        $current = $currentResult.Output[0].ToString().Trim()
    }

    if ($current -eq $BranchName) {
        return
    }

    $local = Invoke-Git -Repository $Repository -Arguments @(
        "show-ref", "--verify", "--quiet", "refs/heads/$BranchName"
    ) -AllowFailure

    if ($local.ExitCode -eq 0) {
        Invoke-Git -Repository $Repository -Arguments @("switch", $BranchName) | Out-Null
        return
    }

    $remoteBranch = Invoke-Git -Repository $Repository -Arguments @(
        "ls-remote", "--exit-code", "--heads", $RemoteName, $BranchName
    ) -AllowFailure

    if ($remoteBranch.ExitCode -eq 0) {
        Invoke-Git -Repository $Repository -Arguments @(
            "fetch", $RemoteName, $BranchName
        ) | Out-Null

        Invoke-Git -Repository $Repository -Arguments @(
            "switch", "-c", $BranchName, "--track", "$RemoteName/$BranchName"
        ) | Out-Null
        return
    }

    if ($AllowCreate) {
        Invoke-Git -Repository $Repository -Arguments @("switch", "-c", $BranchName) | Out-Null
        return
    }

    throw "Branch '$BranchName' does not exist locally or on '$RemoteName'."
}

# Resolve the updater's own folder without depending only on $PSScriptRoot.
$scriptFile = $MyInvocation.MyCommand.Path
$scriptFolder = $null

if (-not [string]::IsNullOrWhiteSpace($scriptFile)) {
    $scriptFolder = Split-Path -Parent $scriptFile
}

if ([string]::IsNullOrWhiteSpace($scriptFolder)) {
    $scriptFolder = (Get-Location).Path
}

if ([string]::IsNullOrWhiteSpace($DestinationFolder)) {
    $DestinationFolder = $scriptFolder
}

$DestinationFolder = [System.IO.Path]::GetFullPath($DestinationFolder)

$tempFolder = $null
$backupFolder = $null
$targetFolder = $null
$repositoryRoot = $null
$installedFolderName = $null
$commitCreated = $false
$replacementInstalled = $false

try {
    if (-not (Test-Path -LiteralPath $DestinationFolder -PathType Container)) {
        throw "Destination folder does not exist: $DestinationFolder"
    }

    & git --version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Git is not installed or is not available in PATH."
    }

    $repoResult = Invoke-Git -Repository $DestinationFolder -Arguments @(
        "rev-parse", "--show-toplevel"
    )

    $repositoryRoot = $repoResult.Output[0].ToString().Trim()
    $commitMessageFile = Join-Path $repositoryRoot $CommitMessageFileName

    Add-LocalGitExclusions -Repository $repositoryRoot -Entries @(
        "/$CommitMessageFileName",
        "/update_from_latest_zip_git.ps1",
        "/run_update_git.bat"
    )

    if (-not (Test-Path -LiteralPath $commitMessageFile -PathType Leaf)) {
        Write-CommitMessageTemplate -Path $commitMessageFile
    }

    Switch-ToBranch `
        -Repository $repositoryRoot `
        -BranchName $Branch `
        -RemoteName $Remote `
        -AllowCreate $CreateBranchIfMissing

    if ($RequireCleanWorkingTree) {
        $statusResult = Invoke-Git -Repository $repositoryRoot -Arguments @("status", "--porcelain")
        $existingChanges = @(
            $statusResult.Output |
            ForEach-Object { $_.ToString() } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        )

        if ($existingChanges.Count -gt 0) {
            throw "Repository contains uncommitted changes:`n$($existingChanges -join [Environment]::NewLine)"
        }
    }

    $downloadsFolder = Get-DownloadsFolder
    if (-not (Test-Path -LiteralPath $downloadsFolder -PathType Container)) {
        throw "Downloads folder could not be found: $downloadsFolder"
    }

    $latestZip = Get-ChildItem -LiteralPath $downloadsFolder -Filter "*.zip" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $latestZip) {
        throw "No ZIP files were found in: $downloadsFolder"
    }

    Write-Step "Branch: $Branch"
    Write-Step "Newest ZIP: $($latestZip.Name)"
    Write-Step "Destination: $DestinationFolder"

    $tempFolder = Join-Path ([System.IO.Path]::GetTempPath()) (
        "zip_update_" + [Guid]::NewGuid().ToString("N")
    )
    New-Item -ItemType Directory -Path $tempFolder | Out-Null

    Write-Step "Extracting ZIP..."
    Expand-Archive -LiteralPath $latestZip.FullName -DestinationPath $tempFolder -Force

    $items = @(
        Get-ChildItem -LiteralPath $tempFolder -Force |
        Where-Object { $_.Name -notin @("__MACOSX", ".DS_Store") }
    )

    $folders = @($items | Where-Object { $_.PSIsContainer })
    $files = @($items | Where-Object { -not $_.PSIsContainer })

    if ($folders.Count -ne 1 -or $files.Count -gt 0) {
        throw "ZIP must contain exactly one top-level folder. Found $($folders.Count) folder(s) and $($files.Count) file(s)."
    }

    $incomingFolder = $folders[0]
    $installedFolderName = $incomingFolder.Name
    $targetFolder = Join-Path $DestinationFolder $installedFolderName

    if (Test-Path -LiteralPath $targetFolder) {
        $backupFolder = Join-Path $DestinationFolder (
            ".{0}.old_{1}" -f $installedFolderName, (Get-Date -Format "yyyyMMdd_HHmmss")
        )

        Write-Step "Temporarily backing up the old folder..."
        Move-Item -LiteralPath $targetFolder -Destination $backupFolder
    }

    Write-Step "Installing the new folder..."
    Move-Item -LiteralPath $incomingFolder.FullName -Destination $DestinationFolder
    $replacementInstalled = $true

    Write-Step "Running post-update script..."
    Invoke-ConfiguredScript -Path $PostUpdateScript -WorkingDirectory $repositoryRoot

    Write-Step "Staging Git changes..."
    Invoke-Git -Repository $repositoryRoot -Arguments @("add", ".") | Out-Null

    $hasNoChanges = Invoke-Git -Repository $repositoryRoot -Arguments @(
        "diff", "--cached", "--quiet"
    ) -AllowFailure

    if ($hasNoChanges.ExitCode -eq 0) {
        if ($backupFolder -and (Test-Path -LiteralPath $backupFolder)) {
            Remove-Item -LiteralPath $backupFolder -Recurse -Force
            $backupFolder = $null
        }

        Write-Host ""
        Write-Host "No Git changes were detected. No commit was created." -ForegroundColor Yellow
        exit 0
    }

    $manualMessage = Get-ManualCommitMessage -Path $commitMessageFile

    if (-not [string]::IsNullOrWhiteSpace($manualMessage)) {
        $commitMessage = $manualMessage
        Write-Step "Using commit message from $CommitMessageFileName"
    }
    else {
        $commitMessage = Get-AutomaticCommitMessage `
            -Repository $repositoryRoot `
            -InstalledFolderName $installedFolderName
        Write-Step "Generated commit message automatically"
    }

    Write-Step "Commit message: $commitMessage"
    Invoke-Git -Repository $repositoryRoot -Arguments @(
        "commit", "-m", $commitMessage
    ) | Out-Null

    $commitCreated = $true

    if ($backupFolder -and (Test-Path -LiteralPath $backupFolder)) {
        Write-Step "Removing old folder backup..."
        Remove-Item -LiteralPath $backupFolder -Recurse -Force
        $backupFolder = $null
    }

    if ($ClearManualMessageAfterCommit -and
        -not [string]::IsNullOrWhiteSpace($manualMessage)) {
        Write-CommitMessageTemplate -Path $commitMessageFile
    }

    if ($PushAfterCommit) {
        Write-Step "Pushing '$Branch' to '$Remote'..."
        Invoke-Git -Repository $repositoryRoot -Arguments @(
            "push", "-u", $Remote, $Branch
        ) | Out-Null
    }

    Write-Host ""
    Write-Host "Update, post-update script, commit, and push completed successfully." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "Update failed: $($_.Exception.Message)" -ForegroundColor Red

    if (-not $commitCreated) {
        if ($replacementInstalled -and $targetFolder -and
            (Test-Path -LiteralPath $targetFolder)) {
            try {
                Remove-Item -LiteralPath $targetFolder -Recurse -Force
            }
            catch {
                Write-Host "Could not remove the failed replacement folder." -ForegroundColor Yellow
            }
        }

        if ($backupFolder -and (Test-Path -LiteralPath $backupFolder)) {
            try {
                Write-Step "Restoring previous folder..."
                Move-Item -LiteralPath $backupFolder -Destination $targetFolder
                $backupFolder = $null
            }
            catch {
                Write-Host "Automatic restore failed. Backup: $backupFolder" -ForegroundColor Red
            }
        }

        if ($repositoryRoot -and (Test-Path -LiteralPath $repositoryRoot -PathType Container)) {
            try {
                Invoke-Git -Repository $repositoryRoot -Arguments @(
                    "reset", "--hard", "HEAD"
                ) | Out-Null
            }
            catch {
                Write-Host "Could not reset tracked Git changes automatically." -ForegroundColor Yellow
            }
        }
    }
    else {
        Write-Host "The commit exists locally. Retry the push with:" -ForegroundColor Yellow
        Write-Host "git push -u $Remote $Branch" -ForegroundColor Yellow
    }

    exit 1
}
finally {
    if ($tempFolder -and (Test-Path -LiteralPath $tempFolder)) {
        Remove-Item -LiteralPath $tempFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
}
