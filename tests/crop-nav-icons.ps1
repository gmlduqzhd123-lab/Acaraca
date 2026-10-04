Add-Type -AssemblyName System.Drawing
$imgPath = "C:\Users\user\.gemini\antigravity\brain\97c078c0-130d-4e7b-8c84-3bba9ed67493\.user_uploaded\media_1791136645604.png"
$img = [System.Drawing.Bitmap]::FromFile($imgPath)

$tabs = @(
    @("home", "songs", "appreciation"),
    @("stage", "scores", "memories"),
    @("rehearsal", "practiceVideos", "education"),
    @("favorites", "recent", "settings")
)

$outDir = "assets/icons/nav"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$cellW = [int]($img.Width / 3)
$cellH = [int]($img.Height / 4)

for ($r = 0; $r -lt 4; $r++) {
    for ($c = 0; $c -lt 3; $c++) {
        $tabKey = $tabs[$r][$c]
        $x0 = $c * $cellW
        $x1 = [Math]::Min($img.Width - 1, ($c + 1) * $cellW - 1)
        $y0 = $r * $cellH
        $y1 = [Math]::Min($img.Height - 1, ($r + 1) * $cellH - 1)

        # Count non-transparent pixels per y line to find the text gap at the bottom
        $rowCounts = @{}
        for ($y = $y0; $y -le $y1; $y++) {
            $cnt = 0
            for ($x = $x0; $x -le $x1; $x++) {
                if ($img.GetPixel($x, $y).A -gt 25) { $cnt++ }
            }
            $rowCounts[$y] = $cnt
        }

        # Find the gap: starting from y1 going upwards, find the text block and then the gap above it
        # Text is at bottom of non-empty rows
        $nonEmptyY = $rowCounts.Keys | Where-Object { $rowCounts[$_] -gt 0 } | Sort-Object
        if ($nonEmptyY.Count -eq 0) { continue }
        $topY = $nonEmptyY[0]
        $bottomY = $nonEmptyY[-1]

        # Scan backwards from bottomY to find gap where rowCount == 0 (or minimum)
        # Text height is typically 15-30 pixels at the bottom
        $gapY = -1
        for ($y = $bottomY - 15; $y -ge $topY + 40; $y--) {
            if ($rowCounts[$y] -eq 0) {
                $gapY = $y
                break
            }
        }
        if ($gapY -eq -1) {
            # Find row with lowest pixel count in the lower 35%
            $candidateY = [int]($topY + ($bottomY - $topY) * 0.72)
            $minVal = 9999
            for ($y = $candidateY - 10; $y -le $candidateY + 15; $y++) {
                if ($rowCounts[$y] -lt $minVal) {
                    $minVal = $rowCounts[$y]
                    $gapY = $y
                }
            }
        }

        # Now icon bounds are from topY to gapY
        $iconMinX = 9999; $iconMaxX = -1; $iconMinY = 9999; $iconMaxY = -1
        for ($y = $topY; $y -lt $gapY; $y++) {
            for ($x = $x0; $x -le $x1; $x++) {
                if ($img.GetPixel($x, $y).A -gt 25) {
                    if ($x -lt $iconMinX) { $iconMinX = $x }
                    if ($x -gt $iconMaxX) { $iconMaxX = $x }
                    if ($y -lt $iconMinY) { $iconMinY = $y }
                    if ($y -gt $iconMaxY) { $iconMaxY = $y }
                }
            }
        }

        # Add a 6px margin
        $pad = 6
        $cropX = [Math]::Max(0, $iconMinX - $pad)
        $cropY = [Math]::Max(0, $iconMinY - $pad)
        $cropW = [Math]::Min($img.Width - $cropX, ($iconMaxX - $iconMinX + 1) + $pad * 2)
        $cropH = [Math]::Min($img.Height - $cropY, ($iconMaxY - $iconMinY + 1) + $pad * 2)

        # Make square
        $side = [Math]::Max($cropW, $cropH)
        $squareBmp = New-Object System.Drawing.Bitmap($side, $side, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($squareBmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)

        $dstX = [int](($side - $cropW) / 2)
        $dstY = [int](($side - $cropH) / 2)
        $srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
        $dstRect = New-Object System.Drawing.Rectangle($dstX, $dstY, $cropW, $cropH)

        $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        $g.Dispose()

        $destFile = "$outDir/$tabKey.png"
        $squareBmp.Save($destFile, [System.Drawing.Imaging.ImageFormat]::Png)
        $squareBmp.Dispose()

        Write-Output "Saved $tabKey -> $destFile (${side}x${side}, cropped from [$cropX,$cropY,$cropW,$cropH])"
    }
}
$img.Dispose()
