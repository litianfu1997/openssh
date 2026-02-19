Add-Type -AssemblyName System.Drawing

$pngPath = "$PSScriptRoot\resources\icon.png"
$icoPath = "$PSScriptRoot\resources\icon.ico"

$sizes = @(16, 32, 48, 64, 128, 256)

$png = [System.Drawing.Image]::FromFile($pngPath)

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# ICO header
$bw.Write([int16]0)       # Reserved
$bw.Write([int16]1)       # Type: 1 = ICO
$bw.Write([int16]$sizes.Count)  # Image count

# We need to write directory first, so we'll collect image bytes
$imageStreams = @()
foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($png, 0, 0, $size, $size)
    $g.Dispose()

    $imgMs = New-Object System.IO.MemoryStream
    $bmp.Save($imgMs, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $imageStreams += $imgMs
}

# Calculate offsets
# Header: 6 bytes, Directory: 16 bytes * count
$offset = 6 + 16 * $sizes.Count

# Write directory entries
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $size = $sizes[$i]
    $imgBytes = $imageStreams[$i].ToArray()
    $w = if ($size -eq 256) { 0 } else { $size }
    $h = if ($size -eq 256) { 0 } else { $size }
    $bw.Write([byte]$w)       # Width
    $bw.Write([byte]$h)       # Height
    $bw.Write([byte]0)        # Color count
    $bw.Write([byte]0)        # Reserved
    $bw.Write([int16]1)       # Planes
    $bw.Write([int16]32)      # Bit count
    $bw.Write([int32]$imgBytes.Length)  # Image size
    $bw.Write([int32]$offset)           # Offset
    $offset += $imgBytes.Length
}

# Write actual image data
foreach ($imgMs in $imageStreams) {
    $bw.Write($imgMs.ToArray())
    $imgMs.Dispose()
}

$png.Dispose()
$bw.Flush()

# Write to file
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$ms.Dispose()

Write-Host "Done! icon.ico created at: $icoPath"
