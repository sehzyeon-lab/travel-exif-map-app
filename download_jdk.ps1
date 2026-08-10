[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$url = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jdk_x64_windows_hotspot_17.0.10_7.zip"
$zipPath = ".\jdk17.zip"
$extractPath = ".\jdk17"

Write-Host "Downloading Portable OpenJDK 17..."
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting OpenJDK 17..."
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
Write-Host "JDK 17 installation complete!"
