param(
  [int]$Threshold = 320,
  [int]$Top = 25
)

$ErrorActionPreference = 'SilentlyContinue'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')

$excludeRegexes = @(
  '\\node_modules\\',
  '\\\.next\\',
  '\\dist\\',
  '\\build\\',
  '\\\.turbo\\',
  '\\coverage\\',
  '\\\.git\\',
  '\\mobile\\android\\',
  '\\mobile\\ios\\'
)

$files = Get-ChildItem -LiteralPath $root -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx |
  Where-Object {
    $full = $_.FullName
    foreach ($rx in $excludeRegexes) {
      if ($full -match $rx) { return $false }
    }
    return $true
  }

$results = foreach ($f in $files) {
  $lines = 0
  try { $lines = (Get-Content -LiteralPath $f.FullName).Length } catch {}
  [pscustomobject]@{
    Lines = $lines
    Path  = $f.FullName.Substring($root.Path.Length + 1)
  }
}

$results | Sort-Object Lines -Descending | Select-Object -First $Top | Format-Table -AutoSize
Write-Output ''
Write-Output ("Over {0} lines:" -f $Threshold)
$results | Where-Object { $_.Lines -gt $Threshold } | Sort-Object Lines -Descending | Format-Table -AutoSize
