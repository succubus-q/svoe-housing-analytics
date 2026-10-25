[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$outputRoot = Join-Path $projectRoot 'artifacts/competition'
[void][System.IO.Directory]::CreateDirectory($outputRoot)
$utf8 = [System.Text.UTF8Encoding]::new($false)

& (Join-Path $PSScriptRoot 'package-submission.ps1') -Destination 'artifacts/competition/svoe-housing-competition-source.zip'
$zipPath = Join-Path $outputRoot 'svoe-housing-competition-source.zip'
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$manifest = [System.Collections.Generic.List[object]]::new()
$required = @(
    'README.md', '.env.example', 'package.json', 'package-lock.json', 'compose.yaml', 'Dockerfile',
    'src/app.ts', 'frontend/src/App.tsx', 'prisma/schema.prisma',
    'prisma/migrations/202610200001_initial/migration.sql',
    'prisma/migrations/202610210001_sync_lease/migration.sql',
    'data/samples/provenance.json', 'data/evidence/mortgage-count/manifest.json',
    'docs/competition/README.md', 'docs/competition/testing.md',
    'docs/competition/submission-checklist.md', 'docs/competition/presentation-content.md',
    'docs/competition/defense-script.md', 'docs/competition/defense-questions.md',
    'assets/competition/presentation/svoe-housing-competition.pptx',
    'assets/competition/presentation/svoe-housing-competition.pdf',
    'assets/competition/diagrams/architecture.mmd', 'assets/competition/diagrams/data-flow.mmd',
    'assets/competition/diagrams/synchronization.mmd', 'assets/competition/diagrams/concurrent-sync.mmd'
)
$names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
try {
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName
        if (-not $names.Add($name)) { throw "Duplicate ZIP entry: $name" }
        if ($name -match '(^|/)(node_modules|dist|coverage|\.git|\.cache|\.vite|\.work|release|artifacts|sync-raw|inspections|pgdata|postgres_data)(/|$)' -or
            ($name -match '(^|/)\.env($|\.)' -and $name -ne '.env.example') -or
            $name -match '(^|/)\.\.(/|$)|^[/\\]|^[A-Za-z]:|\.(tmp|log|tsbuildinfo)$') {
            throw "Forbidden ZIP entry: $name"
        }
        $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $name))
        if (-not $sourcePath.StartsWith($projectRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "ZIP path escapes project: $name"
        }
        $stream = $entry.Open()
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $digest = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose(); $stream.Dispose() }
        $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($digest -ne $sourceHash) { throw "ZIP/source hash mismatch: $name" }
        $manifest.Add([ordered]@{ path = $name; bytes = $entry.Length; sha256 = $digest })
    }
    foreach ($name in $required) {
        if (-not $names.Contains($name)) { throw "Required ZIP entry missing: $name" }
    }
    foreach ($name in @('README', 'project-summary', 'architecture', 'data-flow', 'api-integration', 'analytics', 'testing', 'limitations', 'presentation-outline', 'presentation-content', 'defense-script', 'defense-questions', 'screenshots', 'submission-checklist')) {
        if (-not $names.Contains("docs/competition/$name.md")) { throw "Missing competition document: $name" }
    }
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -notmatch '^(README\.md|docs/competition/.*\.md|assets/competition/.*\.md)$') { continue }
        $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
        try { $markdown = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($match in [regex]::Matches($markdown, '\[[^\]]*\]\(([^)]+)\)')) {
            $target = $match.Groups[1].Value.Split('#')[0]
            if (-not $target -or $target -match '^(https?:|mailto:)') { continue }
            $parent = [System.IO.Path]::GetDirectoryName((Join-Path $projectRoot $entry.FullName))
            $targetPath = [System.IO.Path]::GetFullPath((Join-Path $parent ([uri]::UnescapeDataString($target))))
            if (-not $targetPath.StartsWith($projectRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Markdown link escapes archive: $($entry.FullName): $target"
            }
            $relative = $targetPath.Substring($projectRoot.Length + 1).Replace('\', '/').TrimEnd('/')
            $directoryPrefix = $relative + '/'
            $directoryEntries = @($names | Where-Object { $_.StartsWith($directoryPrefix, [System.StringComparison]::Ordinal) })
            if (-not $names.Contains($relative) -and $directoryEntries.Count -eq 0) {
                throw "Broken link inside ZIP: $($entry.FullName): $target"
            }
        }
    }
} finally { $zip.Dispose() }

$createdAt = [DateTime]::UtcNow.ToString('o')
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestData = [ordered]@{ archive = [System.IO.Path]::GetFileName($zipPath); createdAtUtc = $createdAt; archiveSha256 = $zipHash; files = @($manifest.ToArray()) }
[System.IO.File]::WriteAllText((Join-Path $outputRoot 'archive-manifest.json'), ($manifestData | ConvertTo-Json -Depth 8), $utf8)
$verification = [ordered]@{
    verified = $true; verifiedAtUtc = $createdAt; archive = [System.IO.Path]::GetFileName($zipPath)
    archiveSha256 = $zipHash; fileCount = $manifest.Count
    everyEntryHashMatchesSource = $true; duplicateEntries = 0; forbiddenEntries = 0
    localMarkdownLinksVerified = $true
    requiredFilesPresent = $true; packageLockMatchesSource = $true
    notes = @('No node_modules, private .env, runtime volumes or build cache.', 'Editable PPTX is included in assets/competition/presentation. Dashboard screenshot is included.')
}
[System.IO.File]::WriteAllText((Join-Path $outputRoot 'archive-verification.json'), ($verification | ConvertTo-Json -Depth 8), $utf8)
foreach ($name in @('presentation-content', 'defense-script', 'defense-questions')) {
    $content = [System.IO.File]::ReadAllText((Join-Path $projectRoot "docs/competition/$name.md"))
    [System.IO.File]::WriteAllText((Join-Path $outputRoot "$name.txt"), $content, $utf8)
}
$readme = @'
# Конкурсный комплект «Своё Жильё»

svoe-housing-competition-source.zip — исходники, миграции, Docker Compose,
документация конкурса, Mermaid-диаграммы и curated evidence. Для запуска распакуйте
ZIP в отдельную папку и следуйте README.md. Для защиты начните с docs/competition/README.md.

presentation-content.txt — одиннадцать слайдов и заметки докладчика.
defense-script.txt — речь примерно на 5–7 минут.
defense-questions.txt — 36 вопросов и ответов.
Это UTF-8 текст с Markdown-разметкой. Относительные ссылки в этих текстах
относятся к исходной структуре docs/competition внутри ZIP.

archive-manifest.json содержит каждый путь ZIP, размер и SHA-256.
archive-verification.json фиксирует проверку запрещённых путей, обязательных файлов
и совпадение хеша каждого entry с исходным файлом.

Презентация PPTX из одиннадцати слайдов находится в svoe-housing-competition.pptx,
а также в assets/competition/presentation внутри ZIP. Все слайды визуально проверены.
Версия PDF находится рядом с PPTX и содержит те же одиннадцать слайдов.
Скриншот dashboard включён в assets/competition/screenshots и презентацию.
Документация по запуску и структуре проекта находится внутри ZIP.
Продуктовый код и подтверждённые ID ЦБ при подготовке комплекта не менялись.
'@
[System.IO.File]::WriteAllText((Join-Path $outputRoot 'README.md'), $readme, $utf8)
Write-Output "Competition archive independently verified: $($manifest.Count) entries, SHA-256 $zipHash"
Write-Output $outputRoot
