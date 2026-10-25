[CmdletBinding()]
param(
    [string]$Specification = 'assets/competition/presentation/deck-spec.json',
    [string]$Destination = '.work/presentation/candidate.pptx',
    [string]$PreviewDirectory = '.work/presentation/previews',
    [string]$PdfDestination = '.work/presentation/candidate.pdf'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$specPath = Join-Path $projectRoot $Specification
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Destination))
$previewPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $PreviewDirectory))
[void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outputPath))
[void][System.IO.Directory]::CreateDirectory($previewPath)
$spec = [System.IO.File]::ReadAllText($specPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json

function RGB([string]$hex) {
    return [Convert]::ToInt32($hex.Substring(0,2),16) +
        [Convert]::ToInt32($hex.Substring(2,2),16) * 256 +
        [Convert]::ToInt32($hex.Substring(4,2),16) * 65536
}
function Set-Text($shape, $text, $size, $color, $bold = $false, $alignment = 1, $middle = $false, $tableCell = $false) {
    $frame = $shape.TextFrame
    $frame.MarginLeft = 0; $frame.MarginRight = 0
    $frame.MarginTop = 0; $frame.MarginBottom = 0
    if (-not $tableCell) {
        $frame.WordWrap = -1
        $frame.AutoSize = 0
    }
    $frame.VerticalAnchor = $(if ($middle) { 3 } else { 1 })
    $range = $frame.TextRange
    $range.Text = ([string]$text).Replace("`n", [string][char]11)
    $range.Font.Name = $spec.font
    $range.Font.Size = [single]$size
    $range.Font.Bold = $(if ($bold) { -1 } else { 0 })
    $range.Font.Color.RGB = RGB $color
    $range.ParagraphFormat.Alignment = $alignment
    $range.ParagraphFormat.SpaceBefore = 0
    $range.ParagraphFormat.SpaceAfter = 0
    $range.ParagraphFormat.Bullet.Visible = 0
}

$app = $null
$deck = $null
$startedWithNoDocuments = $false
$fitIssues = [System.Collections.Generic.List[object]]::new()
try {
    $app = New-Object -ComObject PowerPoint.Application
    $startedWithNoDocuments = $app.Presentations.Count -eq 0
    if ($spec.sourcePresentation) {
        $masterPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $spec.sourcePresentation))
        if ($masterPath -eq $outputPath) { throw 'Destination must differ from the editable source presentation' }
        $deck = $app.Presentations.Open($masterPath, -1, 0, 0)
        if ($deck.Slides.Count -ne $spec.slides.Count) { throw 'Editable presentation and specification have different slide counts' }
    } else {
    $deck = $app.Presentations.Add(0)
    $deck.PageSetup.SlideWidth = $spec.slideWidth
    $deck.PageSetup.SlideHeight = $spec.slideHeight
    foreach ($slideSpec in $spec.slides) {
        $slide = $deck.Slides.Add($deck.Slides.Count + 1, 12)
        $slide.FollowMasterBackground = 0
        $slide.Background.Fill.Solid()
        $slide.Background.Fill.ForeColor.RGB = RGB $slideSpec.background
        foreach ($item in $slideSpec.items) {
            switch ($item.kind) {
                'text' {
                    $shape = $slide.Shapes.AddTextbox(1, $item.x, $item.y, $item.w, $item.h)
                    Set-Text $shape $item.text $item.size $item.color $item.bold $item.align
                }
                'node' {
                    $shape = $slide.Shapes.AddShape(1, $item.x, $item.y, $item.w, $item.h)
                    $shape.Fill.Solid()
                    $shape.Fill.ForeColor.RGB = RGB $item.fill
                    $shape.Line.Visible = 0
                    Set-Text $shape $item.text $item.size $item.color $false 2 $true
                    $shape.TextFrame.MarginLeft = 10; $shape.TextFrame.MarginRight = 10
                }
                'image' {
                    $imagePath = Join-Path $projectRoot $item.path
                    $shape = $slide.Shapes.AddPicture($imagePath, 0, -1, $item.x, $item.y, $item.w, $item.h)
                }
                'arrow' {
                    $shape = $slide.Shapes.AddConnector(1, $item.x, $item.y, $item.x2, $item.y2)
                    $shape.Line.ForeColor.RGB = RGB $item.color
                    $shape.Line.Weight = 1.6
                    $shape.Line.EndArrowheadStyle = 3
                }
                'table' {
                    $shape = $slide.Shapes.AddTable($item.rows.Count, $item.rows[0].Count, $item.x, $item.y, $item.w, $item.h)
                    $table = $shape.Table
                    for ($c = 1; $c -le $table.Columns.Count; $c++) { $table.Columns.Item($c).Width = [single]$item.widths[$c-1] }
                    $rowHeight = [single]([double]$item.h / $item.rows.Count)
                    for ($r = 1; $r -le $table.Rows.Count; $r++) {
                        $table.Rows.Item($r).Height = $rowHeight
                        for ($c = 1; $c -le $table.Columns.Count; $c++) {
                            $cell = $table.Cell($r, $c)
                            $fill = if ($r -eq 1) { '17624E' } elseif ($r % 2 -eq 0) { 'F5F8F6' } else { 'FFFFFF' }
                            $color = if ($r -eq 1) { 'FFFFFF' } else { '192F29' }
                            $size = if ($r -eq 1) { $item.headerSize } else { $item.size }
                            $cell.Shape.Fill.Solid()
                            $cell.Shape.Fill.ForeColor.RGB = RGB $fill
                            Set-Text $cell.Shape $item.rows[$r-1][$c-1] $size $color ($r -eq 1) 1 $true $true
                            $cell.Shape.TextFrame.MarginLeft = 12; $cell.Shape.TextFrame.MarginRight = 8
                            $cell.Shape.TextFrame.MarginTop = 5; $cell.Shape.TextFrame.MarginBottom = 5
                            foreach ($border in @(1,2,3,4)) {
                                $cell.Borders.Item($border).ForeColor.RGB = RGB 'FFFFFF'
                                $cell.Borders.Item($border).Weight = 1
                            }
                        }
                    }
                }
            }
            if ($item.kind -eq 'text' -or $item.kind -eq 'node') {
                $shape.Left = [single]$item.x; $shape.Top = [single]$item.y
                $shape.Width = [single]$item.w; $shape.Height = [single]$item.h
            }
        }
        $body = $null
        foreach ($notesShape in $slide.NotesPage.Shapes) {
            if ($notesShape.Type -eq 14 -and $notesShape.PlaceholderFormat.Type -eq 2) { $body = $notesShape; break }
        }
        if ($null -eq $body) { throw "Missing notes placeholder: slide $($slide.SlideIndex)" }
        $body.TextFrame.TextRange.Text = $slideSpec.notes
    }
    }
    foreach ($slide in $deck.Slides) {
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                $boundH = $shape.TextFrame.TextRange.BoundHeight
                $availableH = $shape.Height - $shape.TextFrame.MarginTop - $shape.TextFrame.MarginBottom
                if ($boundH -gt $availableH + 1) {
                    $fitIssues.Add([ordered]@{ slide=$slide.SlideIndex; text=$shape.TextFrame.TextRange.Text; boundHeight=$boundH; availableHeight=$availableH })
                }
            }
        }
    }
    $deck.SaveAs($outputPath, 24)
    $deck.Close()
    $deck = $app.Presentations.Open($outputPath, -1, 0, 0)
    if ($deck.Slides.Count -ne $spec.slides.Count) { throw 'Unexpected slide count after reopening' }
    for ($i = 1; $i -le $deck.Slides.Count; $i++) {
        $png = Join-Path $previewPath ('slide-{0:00}.png' -f $i)
        $deck.Slides.Item($i).Export($png, 'PNG', 1600, 900)
    }
    if ($PdfDestination) {
        $pdfPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $PdfDestination))
        [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($pdfPath))
        $deck.SaveAs($pdfPath, 32)
    }
    $report = [ordered]@{ application='Microsoft PowerPoint'; version=$app.Version; slides=$deck.Slides.Count; reopened=$true; renderedSlides=$deck.Slides.Count; textFitIssues=@($fitIssues.ToArray()) }
    [System.IO.File]::WriteAllText((Join-Path $projectRoot '.work/presentation/powerpoint-check.json'), ($report | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
    if ($fitIssues.Count -gt 0) { throw "Text fit issues: $($fitIssues.Count), inspect .work/presentation/powerpoint-check.json" }
    Write-Output "PPTX created, reopened and rendered in PowerPoint: $outputPath"
} finally {
    if ($null -ne $deck) { $deck.Close() }
    if ($null -ne $app) {
        if ($startedWithNoDocuments -and $app.Presentations.Count -eq 0) { $app.Quit() }
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($app)
    }
}
