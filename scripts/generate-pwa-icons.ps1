Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $root "public\icons"

function New-AppIcon([int]$size, [string]$name, [bool]$maskable) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $background = [System.Drawing.ColorTranslator]::FromHtml("#09110f")
  $green = [System.Drawing.ColorTranslator]::FromHtml("#17392e")
  $gold = [System.Drawing.ColorTranslator]::FromHtml("#e5b957")
  $goldSoft = [System.Drawing.ColorTranslator]::FromHtml("#f3d982")
  $graphics.Clear($background)

  $safeInset = if ($maskable) { [int]($size * 0.16) } else { [int]($size * 0.07) }
  $diameter = $size - (2 * $safeInset)
  $outer = [System.Drawing.Rectangle]::new($safeInset, $safeInset, $diameter, $diameter)
  $greenBrush = [System.Drawing.SolidBrush]::new($green)
  $graphics.FillEllipse($greenBrush, $outer)

  $penWidth = [Math]::Max(3, [int]($size * 0.018))
  $goldPen = [System.Drawing.Pen]::new($gold, $penWidth)
  $graphics.DrawEllipse($goldPen, $outer)
  $innerInset = $safeInset + [int]($size * 0.035)
  $innerDiameter = $size - (2 * $innerInset)
  $inner = [System.Drawing.Rectangle]::new($innerInset, $innerInset, $innerDiameter, $innerDiameter)
  $innerColor = [System.Drawing.Color]::FromArgb(75, $goldSoft)
  $innerWidth = [Math]::Max(1, [int]($size * 0.005))
  $innerPen = [System.Drawing.Pen]::new($innerColor, $innerWidth)
  $graphics.DrawEllipse($innerPen, $inner)

  $fontSize = [single]($size * 0.39)
  $font = [System.Drawing.Font]::new("Yu Mincho", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textTop = [single](-$size * 0.025)
  $textRect = [System.Drawing.RectangleF]::new(0, $textTop, $size, $size)
  $textBrush = [System.Drawing.SolidBrush]::new($goldSoft)
  $seal = [char]0x5E02
  $graphics.DrawString($seal, $font, $textBrush, $textRect, $format)

  $path = Join-Path $iconDir $name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $textBrush.Dispose()
  $format.Dispose()
  $font.Dispose()
  $innerPen.Dispose()
  $goldPen.Dispose()
  $greenBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-AppIcon 192 "app-icon-192.png" $false
New-AppIcon 512 "app-icon-512.png" $false
New-AppIcon 512 "app-icon-maskable-512.png" $true
