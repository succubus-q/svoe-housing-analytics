[CmdletBinding()]
param([string]$Destination = 'release/svoe-housing-mvp.zip')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$submissionRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$releaseRoot = Join-Path $submissionRoot 'release'
$competitionRoot = Join-Path $submissionRoot 'artifacts/competition'
$archivePath = [System.IO.Path]::GetFullPath((Join-Path $submissionRoot $Destination))
$allowedDestination = $archivePath.StartsWith($releaseRoot + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
    $archivePath.StartsWith($competitionRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)
if (-not $allowedDestination -or
    [System.IO.Path]::GetExtension($archivePath) -ne '.zip') {
    throw 'Destination must be a .zip file inside this project/release or artifacts/competition directory'
}

$submissionFiles = [System.Collections.Generic.SortedSet[string]]::new([System.StringComparer]::Ordinal)
$rootFiles = @(
    'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.js',
    '.gitignore', '.gitattributes', '.dockerignore', '.env.example', '.prettierignore', '.prettierrc.json',
    'README.md', 'Dockerfile', 'compose.yaml', 'frontend/package.json',
    'frontend/tsconfig.json', 'frontend/vite.config.ts', 'frontend/index.html'
)
foreach ($file in $rootFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $submissionRoot $file) -PathType Leaf)) { throw "Required file missing: $file" }
    [void]$submissionFiles.Add($file)
}
$extensions = @('.ts', '.tsx', '.js', '.mjs', '.json', '.css', '.html', '.md', '.sql', '.toml', '.prisma', '.ps1', '.conf', '.yaml', '.yml', '.mmd', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.pptx', '.txt')
function Add-SubmissionDirectory([string]$directory) {
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
        if ($entry.LinkType -in @('SymbolicLink', 'Junction')) { continue }
        if ($entry.Name -in @('node_modules', 'dist', 'coverage', '.git', '.cache', '.vite', '.work')) { continue }
        if ($entry.PSIsContainer) { Add-SubmissionDirectory $entry.FullName; continue }
        if ($entry.Name -like '.env*' -or $entry.Extension -notin $extensions) { continue }
        $relative = $entry.FullName.Substring($submissionRoot.Length + 1).Replace('\', '/')
        [void]$submissionFiles.Add($relative)
    }
}
foreach ($directory in @('src', 'frontend/src', 'prisma', 'tests', 'scripts', 'deploy', 'docs', 'data/samples', 'data/evidence', 'assets/competition')) {
    if (-not (Test-Path -LiteralPath (Join-Path $submissionRoot $directory) -PathType Container)) {
        if ($directory -eq 'assets/competition') { continue }
        throw "Required directory missing: $directory"
    }
    Add-SubmissionDirectory (Join-Path $submissionRoot $directory)
}
[void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($archivePath))
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $submissionFiles) {
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, (Join-Path $submissionRoot $file), $file, [System.IO.Compression.CompressionLevel]::Optimal)
    }
} finally { $archive.Dispose(); $stream.Dispose() }

$check = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($entry in $check.Entries) {
        if ($entry.FullName -match '(^|/)(node_modules|dist|inspections|sync-raw|logs|\.git|coverage|\.cache|\.work|\.vite|artifacts|release|pgdata|postgres_data)(/|$)' -or
            $entry.FullName -match '(^|/)\.env($|\.)' -and $entry.FullName -ne '.env.example') {
            throw "Forbidden archive entry: $($entry.FullName)"
        }
    }
    $lock = $check.GetEntry('package-lock.json')
    if ($null -eq $lock -or $null -eq $check.GetEntry('.env.example') -or $null -eq $check.GetEntry('prisma/schema.prisma')) { throw 'Lockfile, env example or Prisma schema missing' }
    $lockStream = $lock.Open()
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try { $archiveLockHash = [System.BitConverter]::ToString($hash.ComputeHash($lockStream)).Replace('-', '') }
    finally { $hash.Dispose(); $lockStream.Dispose() }
    if ($archiveLockHash -ne (Get-FileHash -LiteralPath (Join-Path $submissionRoot 'package-lock.json') -Algorithm SHA256).Hash) {
        throw 'package-lock.json differs from source'
    }
    if ($check.Entries.Count -ne $submissionFiles.Count) { throw 'Archive file count differs from allowlist' }
    foreach ($file in $submissionFiles) {
        if ($null -eq $check.GetEntry($file)) { throw "Missing archive entry: $file" }
    }
    if (Test-Path -LiteralPath (Join-Path $submissionRoot 'docs/competition/README.md')) {
        foreach ($required in @('docs/competition/README.md', 'docs/competition/submission-checklist.md', 'assets/competition/diagrams/architecture.mmd')) {
            if ($null -eq $check.GetEntry($required)) { throw "Competition entry missing: $required" }
        }
    }
    Write-Output "Verified $($check.Entries.Count) source files; package-lock.json preserved; no runtime/secret artifacts."
} finally { $check.Dispose() }
Write-Output $archivePath
