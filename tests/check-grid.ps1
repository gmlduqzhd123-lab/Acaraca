Add-Type -AssemblyName System.Drawing
$imgPath = "C:\Users\user\.gemini\antigravity\brain\97c078c0-130d-4e7b-8c84-3bba9ed67493\.user_uploaded\media_1791136645604.png"
$img = [System.Drawing.Bitmap]::FromFile($imgPath)

$w = $img.Width
$h = $img.Height
$cellW = [int]($w / 3)
$cellH = [int]($h / 4)

Write-Output "Image $w x $h, cell $cellW x $cellH"

for ($r = 0; $r -lt 4; $r++) {
    for ($c = 0; $c -lt 3; $c++) {
        $x0 = $c * $cellW
        $x1 = [Math]::Min($w - 1, ($c + 1) * $cellW - 1)
        $y0 = $r * $cellH
        $y1 = [Math]::Min($h - 1, ($r + 1) * $cellH - 1)

        $minX = 9999; $maxX = -1; $minY = 9999; $maxY = -1
        for ($y = $y0; $y -le $y1; $y++) {
            for ($x = $x0; $x -le $x1; $x++) {
                $p = $img.GetPixel($x, $y)
                if ($p.A -gt 20) {
                    if ($x -lt $minX) { $minX = $x }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
        Write-Output "Cell ($r,$c): x=[$minX, $maxX], y=[$minY, $maxY], height=$($maxY - $minY)"
    }
}
$img.Dispose()
